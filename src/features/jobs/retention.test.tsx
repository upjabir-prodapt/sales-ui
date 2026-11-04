import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedJob } from '@aicoe/aihub-platform/jobs';
import { listResearchJobs, RETENTION_EXPIRED_MESSAGE, RetentionExpiredError } from '../../api/client';
import type { ResearchJobListItem } from '../../api/types';
import { salesHistoryPages } from './historyPages';
import { availableUntilLabel, normalizeSalesHistoryItem, salesJobSource } from './jobSource';
import { LoadMoreRuns } from './LoadMoreRuns';
import { SalesJobsProvider } from './SalesJobsContext';

/**
 * Six-month retention, UI side (docs/35 3.0a): the job list pages by the
 * service's `next_cursor` behind a "Load more" control, each run says how long
 * it stays available, and a 410 shows the service's own message.
 */

const EXPIRED = "This job's files were deleted after the 6-month retention period.";

function job(id: string, overrides: Partial<ResearchJobListItem> = {}): ResearchJobListItem {
  return {
    job_id: id,
    status: 'COMPLETED',
    company_name: `Co ${id}`,
    created_at: '2026-06-01T00:00:00+00:00',
    expires_at: '2099-12-01T00:00:00+00:00',
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SalesJobsProvider>{children}</SalesJobsProvider>
);

beforeEach(() => {
  salesHistoryPages.reset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listResearchJobs', () => {
  it('sends the cursor and returns next_cursor', async () => {
    fetchMock.mockResolvedValueOnce(json({ jobs: [job('a')], next_cursor: 'c/2+=' }));

    const page = await listResearchJobs('c/1+=');

    expect(requestedUrls()).toEqual(['/api/sales/v1/research/jobs?cursor=c%2F1%2B%3D']);
    expect(page).toEqual({ jobs: [job('a')], next_cursor: 'c/2+=' });
  });

  it('still reads the old bare-array shape as a single page', async () => {
    fetchMock.mockResolvedValueOnce(json([job('a')]));
    expect(await listResearchJobs()).toEqual({ jobs: [job('a')], next_cursor: null });
  });
});

describe('Load more', () => {
  it('appends the next page without duplicates and stops at the last page', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ jobs: [job('j5'), job('j4')], next_cursor: 'cur-1' }))
      // j4 repeats a first-page row; j3 repeats nothing.
      .mockResolvedValueOnce(json({ jobs: [job('j4'), job('j3'), job('j2')], next_cursor: 'cur-2' }))
      .mockResolvedValueOnce(json({ jobs: [job('j2'), job('j1')] }));

    const first = await salesJobSource.listHistory();
    expect(first.map((j) => j.id)).toEqual(['j5', 'j4']);

    const active = renderHook(() => salesJobSource.useActive(), { wrapper });
    render(<LoadMoreRuns />);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(salesHistoryPages.getState().older.map((j) => j.job_id)).toEqual(['j3', 'j2']));
    expect(requestedUrls()[1]).toBe('/api/sales/v1/research/jobs?cursor=cur-1');

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(salesHistoryPages.getState().older.map((j) => j.job_id)).toEqual(['j3', 'j2', 'j1']),
    );
    expect(requestedUrls()[2]).toBe('/api/sales/v1/research/jobs?cursor=cur-2');

    // Last page: no next_cursor, so the control is gone.
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    // The older pages reach the shared job list through useActive.
    expect(active.result.current.map((j) => j.key)).toEqual(['sales:j3', 'sales:j2', 'sales:j1']);
  });

  it('is not shown when the first page is the only page', async () => {
    fetchMock.mockResolvedValueOnce(json({ jobs: [job('j1')] }));
    await salesJobSource.listHistory();
    render(<LoadMoreRuns />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('drops loaded older pages once the server has nothing past the first page', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ jobs: [job('j2')], next_cursor: 'cur-1' }))
      .mockResolvedValueOnce(json({ jobs: [job('j1')] }))
      .mockResolvedValueOnce(json({ jobs: [job('j2')] }));

    await salesJobSource.listHistory();
    await act(() => salesHistoryPages.loadMore());
    expect(salesHistoryPages.getState().older).toHaveLength(1);

    // j1 aged out of retention: a refresh must not keep showing it.
    await salesJobSource.listHistory();
    expect(salesHistoryPages.getState().older).toEqual([]);
  });
});

describe('Available until', () => {
  it('adds the localised expiry date to the row subtitle', () => {
    const expected = new Date('2027-05-03T00:00:00Z').toLocaleDateString(undefined, {
      dateStyle: 'medium',
    });
    const row = normalizeSalesHistoryItem(
      job('j1', { account_id: 'ACC-1', expires_at: '2027-05-03T00:00:00Z' }),
    );
    expect(row.subtitle).toBe(`Sales research · Account ACC-1 · Available until ${expected}`);
  });

  it('is left out when the service sends no expires_at', () => {
    expect(availableUntilLabel(undefined)).toBeNull();
    expect(availableUntilLabel('not a date')).toBeNull();
    expect(normalizeSalesHistoryItem(job('j1', { expires_at: null })).subtitle).toBe('Sales research');
  });
});

describe('410 Gone', () => {
  const row: UnifiedJob = normalizeSalesHistoryItem(job('j1'));

  it('download shows the server message, not a generic error', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'JOB_EXPIRED', detail: EXPIRED }, 410));
    const actions = renderHook(() => salesJobSource.useActions(), { wrapper }).result.current;

    const failure = actions.download(row);
    await expect(failure).rejects.toBeInstanceOf(RetentionExpiredError);
    await expect(failure).rejects.toThrow(EXPIRED);
    expect(salesHistoryPages.getState().expired['sales:j1']).toMatchObject({
      errorMessage: EXPIRED,
      canDownload: false,
    });
  });

  it('result shows the server message on the row', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: EXPIRED }, 410));

    await expect(salesJobSource.fetchDetail!(row)).rejects.toThrow(EXPIRED);

    const active = renderHook(() => salesJobSource.useActive(), { wrapper });
    expect(active.result.current).toEqual([
      expect.objectContaining({ key: 'sales:j1', errorMessage: EXPIRED, canDownload: false }),
    ]);
  });

  it('falls back to the retention wording when the body has no message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 410 }));
    await expect(salesJobSource.fetchDetail!(row)).rejects.toThrow(RETENTION_EXPIRED_MESSAGE);
  });

  it('leaves other errors as they were', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'Not found' }, 404));
    const err = await salesJobSource.fetchDetail!(row).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(RetentionExpiredError);
    expect(salesHistoryPages.getState().expired).toEqual({});
  });
});
