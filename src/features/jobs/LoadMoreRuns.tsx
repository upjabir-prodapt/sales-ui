import React from 'react';
import { salesHistoryPages, useSalesHistoryPages } from './historyPages';

/**
 * "Load more" under the Sales job list: fetches the next (older) page of
 * `GET /research/jobs` and appends it. Shown only while the server reports a
 * `next_cursor`, so it disappears once the oldest run in retention is listed.
 */
export const LoadMoreRuns: React.FC = () => {
  const { nextCursor, loadingMore, loadMoreError } = useSalesHistoryPages();
  if (!nextCursor && !loadMoreError) return null;
  return (
    <div className="sa-load-more">
      {loadMoreError && (
        <p className="sa-load-more-error" role="alert">
          {loadMoreError}
        </p>
      )}
      {nextCursor && (
        <button
          type="button"
          className="tracker-refresh-btn"
          onClick={() => void salesHistoryPages.loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
};
