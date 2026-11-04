import type {
  InitiateResearchResponse,
  ResearchStatusResponse,
  ResearchModelCard,
  ResearchResultResponse,
  ResearchJobListItem,
  ResearchJobListPage,
} from './types';
import { ApiError, apiDownload, apiJson, apiPostJson } from '@aicoe/aihub-platform/api';

export type {
  InitiateResearchResponse,
  ResearchStatusResponse,
  ResearchModelCard,
  ResearchResultResponse,
  ResearchJobListItem,
  ResearchJobListPage,
};

/** Shown for a 410 if the service's own message is missing. */
export const RETENTION_EXPIRED_MESSAGE =
  "This job's files were deleted after the 6-month retention period.";

/**
 * A run past the service's retention period, or whose report files are gone
 * (`410` from `/research/result` or `/research/download`). `message` is the
 * service's own wording, safe to show as-is.
 */
export class RetentionExpiredError extends Error {
  readonly status = 410;
  constructor(message: string) {
    super(message);
    this.name = 'RetentionExpiredError';
  }
}

function serverDetail(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return null;
}

/** Re-throws a 410 as `RetentionExpiredError` carrying the server's message. */
async function expiredAware<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) {
      throw new RetentionExpiredError(serverDetail(err.body) ?? RETENTION_EXPIRED_MESSAGE);
    }
    throw err;
  }
}

/**
 * Same-origin `/api/sales/v1/*`, proxied by the BFF to Apigee.
 *
 * The per-service session that used to live here is gone: no `salesAuthenticate`,
 * no `sales_auth_user` / `sales_google_id_token` in localStorage, no business
 * unit / organization prompt. Those are now `department` and `companyName` on
 * the single BFF session, sourced from MS Graph at sign-in (decision D6).
 */
const API_BASE = '/api/sales/v1';

/** `POST /research/initiate` */
export async function initiateResearch(
  account_id: string,
  company_name: string,
): Promise<InitiateResearchResponse> {
  return await apiPostJson<InitiateResearchResponse>(
    `${API_BASE}/research/initiate`,
    { account_id, company_name },
    { errorMessage: 'Failed to initiate research' },
  );
}

/** `GET /research/status/{job_id}` */
export async function getResearchStatus(job_id: string): Promise<ResearchStatusResponse> {
  return await apiJson<ResearchStatusResponse>(`${API_BASE}/research/status/${job_id}`, {
    errorMessage: 'Failed to fetch status',
  });
}

/** `GET /research/result/{job_id}` */
export async function getResearchResult(job_id: string): Promise<ResearchResultResponse> {
  return await expiredAware(() =>
    apiJson<ResearchResultResponse>(`${API_BASE}/research/result/${job_id}`, {
      errorMessage: 'Failed to fetch result',
    }),
  );
}

/**
 * `GET /research/jobs` — one page of this user's research runs, newest first.
 *
 * The backend lists runs for its retention period (6 months from creation,
 * each row's `expires_at`) and pages by an opaque cursor: pass the previous
 * page's `next_cursor` to get the next, older page. The UI does not filter by
 * date on top of it.
 */
export async function listResearchJobs(cursor?: string | null): Promise<ResearchJobListPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const data = await apiJson<Partial<ResearchJobListPage> | ResearchJobListItem[]>(
    `${API_BASE}/research/jobs${query}`,
    { errorMessage: 'Failed to fetch research history' },
  );
  // A bare array is the pre-paging shape: one page, nothing after it.
  if (Array.isArray(data)) return { jobs: data, next_cursor: null };
  return {
    jobs: Array.isArray(data?.jobs) ? data.jobs : [],
    next_cursor: typeof data?.next_cursor === 'string' ? data.next_cursor : null,
  };
}

/** `DELETE /research/{job_id}` — cancel a running research job. */
export async function cancelResearch(job_id: string): Promise<{ message: string }> {
  return await apiJson<{ message: string }>(`${API_BASE}/research/${job_id}`, {
    method: 'DELETE',
    errorMessage: 'Failed to cancel research job',
  });
}

/** `GET /research/download/{job_id}` */
export async function downloadResearchFile(job_id: string): Promise<void> {
  // Fallback only: the service sends Content-Disposition with the real name
  // (Research_Report_<Company>.pdf), which apiDownload prefers. It streams
  // application/pdf, so the fallback must not claim .md.
  await expiredAware(() =>
    apiDownload(`${API_BASE}/research/download/${job_id}`, `research-${job_id}.pdf`),
  );
}
