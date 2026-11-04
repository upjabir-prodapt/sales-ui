import { useMemo } from 'react';
import {
  type JobSource,
  type JobSourceActions,
  type UnifiedJob,
  type UnifiedJobDetail,
  type UnifiedJobStatus,
  shortRunLabel,
  toFinitePercent,
} from '@aicoe/aihub-platform/jobs';
import type { ResearchJobListItem } from '../../api/client';
import {
  downloadResearchFile,
  getResearchResult,
  listResearchJobs,
  RetentionExpiredError,
} from '../../api/client';
import type { ResearchResultResponse } from '../../api/types';
import { openRunFeedback } from '@aicoe/aihub-platform/ui';
import type { SalesJobRecord } from './useSalesJobsState';
import { useSalesJobs } from './useSalesJobs';
import { salesHistoryPages, useSalesHistoryPages } from './historyPages';

const SALES_STATUS_MAP: Record<string, UnifiedJobStatus> = {
  pending: 'queued',
  queued: 'queued',
  processing: 'running',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

function mapSalesStatus(raw: string | undefined): UnifiedJobStatus {
  return SALES_STATUS_MAP[raw?.toLowerCase?.() ?? ''] ?? 'queued';
}

/** "Available until 3 May 2027" in the viewer's locale; null without a valid date. */
export function availableUntilLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Available until ${date.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

function salesSubtitle(accountId: string | null | undefined, expiresAt: string | null | undefined): string {
  return [
    'Sales research',
    accountId ? `Account ${accountId}` : null,
    availableUntilLabel(expiresAt),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Normalizes an item from `GET /research/jobs` (server-side history). */
export function normalizeSalesHistoryItem(item: ResearchJobListItem): UnifiedJob {
  const status = mapSalesStatus(item.status);
  const company = item.company_name?.trim() || item.company?.trim() || '';
  return {
    key: `sales:${item.job_id}`,
    id: item.job_id,
    service: 'sales',
    serviceLabel: 'Sales research',
    title: company || shortRunLabel(item.job_id),
    subtitle: salesSubtitle(item.account_id, item.expires_at),
    status,
    progress: toFinitePercent(item.progress),
    createdAt: item.created_at ?? null,
    completedAt: item.completed_at ?? null,
    errorMessage: item.error_message ?? null,
    canCancel: status === 'queued' || status === 'running',
    canDownload: status === 'completed',
    // Feedback on a finished run goes to the AI Hub's ticket form (openRunFeedback).
    canReview: status === 'completed',
    startedBy: null,
  };
}

/** Normalizes a locally-tracked in-session run (instant feedback before refresh). */
export function normalizeSalesJob(item: SalesJobRecord): UnifiedJob {
  const status = mapSalesStatus(item.status);
  return {
    key: `sales:${item.job_id}`,
    id: item.job_id,
    service: 'sales',
    serviceLabel: 'Sales research',
    title: item.company_name || item.job_id,
    subtitle: salesSubtitle(item.account_id, item.expiresAt),
    status,
    progress: null,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    errorMessage: item.errorMessage,
    canCancel: status === 'queued' || status === 'running',
    canDownload: status === 'completed',
    // Feedback on a finished run goes to the AI Hub's ticket form (openRunFeedback).
    canReview: status === 'completed',
    startedBy: null,
  };
}

/**
 * Sales equivalent of `extractTranslationDetail`, mapping the service's
 * `model_card` onto the same shape so a research row expands to the same
 * cost/tokens/time/model detail a translation row does.
 *
 * The Sales page used to show these in its own inline report panel. That panel
 * only ever described the newest run, so the numbers are surfaced per row here
 * instead — the same place Translation has always put them.
 */
export function extractSalesDetail(result: ResearchResultResponse): UnifiedJobDetail {
  const card = result.model_card;
  return {
    costUsd: typeof card?.cost_usd === 'number' ? card.cost_usd : null,
    tokenCount: typeof card?.tokens_used === 'number' ? card.tokens_used : null,
    processingTimeSeconds:
      typeof card?.latency_seconds === 'number' ? card.latency_seconds : null,
    // The service reports one `model_version` rather than a name/version pair.
    modelUsed: card?.model_version ?? null,
    modelVersion: card?.model_version ?? null,
    // No per-run quality score in the research pipeline.
    qualityScore: null,
  };
}


/** Runs `call`; on a 410 marks the row expired with the server's message, then re-throws. */
async function markIfExpired<T>(job: UnifiedJob, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof RetentionExpiredError) salesHistoryPages.markExpired(job, err.message);
    throw err;
  }
}

export const salesJobSource: JobSource = {
  slug: 'sales',
  // The first page only; "Load more" pages are in historyPages.ts.
  listHistory: async () => {
    const page = await listResearchJobs();
    salesHistoryPages.setFirstPage(page);
    return page.jobs.map(normalizeSalesHistoryItem);
  },
  // In-session runs, plus the older pages and 410 overrides, which the
  // platform merges over the history by job key (later entries win).
  useActive: () => {
    const ctx = useSalesJobs();
    const pages = useSalesHistoryPages();
    return useMemo(
      () => [
        ...pages.older.map(normalizeSalesHistoryItem),
        ...ctx.jobOrder
          .map((id) => ctx.jobs[id])
          .filter((j): j is NonNullable<typeof j> => !!j)
          .map(normalizeSalesJob),
        ...Object.values(pages.expired),
      ],
      [ctx.jobOrder, ctx.jobs, pages.older, pages.expired],
    );
  },
  useActions: (): JobSourceActions => {
    const ctx = useSalesJobs();
    return useMemo(
      () => ({
        cancel: (job: UnifiedJob) => ctx.cancelJob(job.id),
        // A 410 rejects with the server's message, which the platform shows
        // as the action error; the row is also marked expired.
        download: (job: UnifiedJob) => markIfExpired(job, () => downloadResearchFile(job.id)),
        refresh: () => ctx.refreshAll(),
      }),
      [ctx],
    );
  },
  openFeedback: openRunFeedback,
  label: 'Sales Agent',
  // Backend keeps runs and outputs for JOB_RETENTION_DAYS (183); shown in the Job Tracker.
  historyWindow: '6 months',
  fetchDetail: async (job) =>
    extractSalesDetail(await markIfExpired(job, () => getResearchResult(job.id))),
};
