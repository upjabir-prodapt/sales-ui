import { useSyncExternalStore } from 'react';
import type { UnifiedJob } from '@aicoe/aihub-platform/jobs';
import { listResearchJobs, type ResearchJobListItem, type ResearchJobListPage } from '../../api/client';

/**
 * Paging state for `GET /research/jobs` beyond its first page.
 *
 * The platform's `useServiceJobs` re-pulls only the first page (via
 * `salesJobSource.listHistory`), on mount and while runs are active. Older
 * pages fetched with "Load more" live here and reach the shared job surfaces
 * through `salesJobSource.useActive`, which the platform merges with history
 * by job key, so a run seen on two pages still shows once.
 *
 * Nothing here is persisted: every row came from the server in this tab, so
 * none can outlive the server's retention window across a reload.
 */
export interface SalesHistoryPagesState {
  /** Cursor for the next "Load more"; null when there is nothing older. */
  nextCursor: string | null;
  /** Rows from pages after the first, newest first, unique by job_id. */
  older: ResearchJobListItem[];
  loadingMore: boolean;
  loadMoreError: string | null;
  /** Rows whose report answered 410, as they should now be shown. */
  expired: Record<string, UnifiedJob>;
}

const INITIAL: SalesHistoryPagesState = {
  nextCursor: null,
  older: [],
  loadingMore: false,
  loadMoreError: null,
  expired: {},
};

let state: SalesHistoryPagesState = INITIAL;
/** The first page's own cursor, used until an older page has been loaded. */
let firstPageCursor: string | null = null;
let firstPageIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function setState(next: Partial<SalesHistoryPagesState>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function stillListed(item: ResearchJobListItem, now: number): boolean {
  if (!item.expires_at) return true;
  const expiry = new Date(item.expires_at).getTime();
  return Number.isNaN(expiry) || expiry > now;
}

export const salesHistoryPages = {
  getState: (): SalesHistoryPagesState => state,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Called with every fresh first page. */
  setFirstPage(page: ResearchJobListPage): void {
    firstPageCursor = page.next_cursor ?? null;
    firstPageIds = new Set(page.jobs.map((job) => job.job_id));
    if (!firstPageCursor) {
      // The server now has nothing past the first page, so any older rows
      // held here have aged out of retention: drop them rather than keep
      // showing runs the server no longer returns.
      setState({ older: [], nextCursor: null });
      return;
    }
    const now = Date.now();
    const older = state.older.filter((job) => !firstPageIds.has(job.job_id) && stillListed(job, now));
    setState({ older, nextCursor: older.length > 0 ? state.nextCursor : firstPageCursor });
  },

  /** Fetches the page after the last one shown and appends it. */
  async loadMore(): Promise<void> {
    const cursor = state.nextCursor;
    if (!cursor || state.loadingMore) return;
    setState({ loadingMore: true, loadMoreError: null });
    try {
      const page = await listResearchJobs(cursor);
      const known = new Set([...firstPageIds, ...state.older.map((job) => job.job_id)]);
      const fresh = page.jobs.filter((job) => !known.has(job.job_id));
      setState({
        older: [...state.older, ...fresh],
        nextCursor: page.next_cursor ?? null,
        loadingMore: false,
      });
    } catch (err) {
      setState({
        loadingMore: false,
        loadMoreError: err instanceof Error ? err.message : 'Could not load older runs.',
      });
    }
  },

  /** Shows the server's 410 message on the run's row, with no download offered. */
  markExpired(job: UnifiedJob, message: string): void {
    setState({
      expired: {
        ...state.expired,
        [job.key]: {
          ...job,
          errorMessage: message,
          canDownload: false,
          canReview: false,
          detailStatus: 'error',
        },
      },
    });
  },

  /** For tests. */
  reset(): void {
    state = INITIAL;
    firstPageCursor = null;
    firstPageIds = new Set();
    listeners.forEach((listener) => listener());
  },
};

export function useSalesHistoryPages(): SalesHistoryPagesState {
  return useSyncExternalStore(salesHistoryPages.subscribe, salesHistoryPages.getState);
}
