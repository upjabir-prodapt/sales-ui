// ── Sales Agent Types ──────────────────────────────────────────────────────

export interface SalesAuthUser {
  email: string;
  business_unit: string;
  organization: string;
}

export interface SalesTokenResponse {
  access_token: string;
  token_type: string;
  email: string;
}

export interface InitiateResearchResponse {
  job_id: string;
  status: string;
  [key: string]: unknown;
}

/**
 * Research run statuses, as emitted by the Sales Agent service (uppercase,
 * unlike Translation's lowercase set). `CANCELLED` is returned after
 * `DELETE /research/{job_id}` and was previously missing here, so the two
 * frontend spellings of this union disagreed.
 */
export type SalesJobStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ResearchStatusResponse {
  job_id: string;
  status: SalesJobStatus;
  /** When the run's report stops being available (ISO 8601 UTC). */
  expires_at?: string | null;
  [key: string]: unknown;
}

/** Cost & model metadata for a completed research run (backend `model_card`). */
export interface ResearchModelCard {
  model_version?: string | null;
  tokens_used?: number | null;
  latency_seconds?: number | null;
  cost_usd?: number | null;
}

export interface ResearchResultResponse {
  job_id: string;
  /** Backend uses `request_id`; kept alongside job_id for compatibility. */
  request_id?: string;
  status: string;
  /** Canonical field returned by the backend (FastAPI `ResearchResultResponse`). */
  report_content?: string;
  /** Legacy alias — no longer emitted by the backend; kept for compatibility. */
  report_markdown?: string;
  model_card?: ResearchModelCard | null;
  /** When the run's report stops being available (ISO 8601 UTC). */
  expires_at?: string | null;
  [key: string]: unknown;
}

/**
 * One entry from the research job history.
 */
export interface ResearchJobListItem {
  job_id: string;
  status: string;
  company_name?: string | null;
  company?: string | null;
  account_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  /**
   * created_at + the service's retention period (ISO 8601 UTC). After it the
   * run is no longer listed and its report answers 410.
   */
  expires_at?: string | null;
  error_message?: string | null;
  progress?: number | null;
}

/** One page of `GET /research/jobs`, newest first. */
export interface ResearchJobListPage {
  jobs: ResearchJobListItem[];
  /** Pass back as `cursor` for the next (older) page; absent on the last page. */
  next_cursor?: string | null;
}
