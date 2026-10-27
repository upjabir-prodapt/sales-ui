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
import { downloadResearchFile, getResearchResult, listResearchJobs } from '../../api/client';
import type { ResearchResultResponse } from '../../api/types';
import { openRunFeedback } from '@aicoe/aihub-platform/ui';
import type { SalesJobRecord } from './useSalesJobsState';
import { useSalesJobs } from './useSalesJobs';

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
    subtitle: item.account_id
      ? `Sales research · Account ${item.account_id}`
      : 'Sales research',
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
    subtitle: item.account_id ? `Sales research · Account ${item.account_id}` : 'Sales research',
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


export const salesJobSource: JobSource = {
  slug: 'sales',
  listHistory: async () => (await listResearchJobs()).map(normalizeSalesHistoryItem),
  useActive: () => {
    const ctx = useSalesJobs();
    return useMemo(
      () =>
        ctx.jobOrder
          .map((id) => ctx.jobs[id])
          .filter((j): j is NonNullable<typeof j> => !!j)
          .map(normalizeSalesJob),
      [ctx.jobOrder, ctx.jobs],
    );
  },
  useActions: (): JobSourceActions => {
    const ctx = useSalesJobs();
    return useMemo(
      () => ({
        cancel: (job: UnifiedJob) => ctx.cancelJob(job.id),
        download: (job: UnifiedJob) => downloadResearchFile(job.id),
        refresh: () => ctx.refreshAll(),
      }),
      [ctx],
    );
  },
  openFeedback: openRunFeedback,
  label: 'Sales Agent',
  fetchDetail: async (job) => extractSalesDetail(await getResearchResult(job.id)),
};
