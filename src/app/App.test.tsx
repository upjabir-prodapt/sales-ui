import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@aicoe/aihub-platform/i18n';
import App from './App';

const leaveApp = vi.fn();
vi.mock('./leaveApp', () => ({ leaveApp: (url: string) => leaveApp(url) }));

/**
 * The whole composition root, as main.tsx mounts it: the real router,
 * registry, platform providers and Sales' own job provider. Only the network is
 * stubbed, with the BFF's `GET /auth/session` answering for a Sales user.
 *
 * Every response is JSON with an empty list, which is also what the shell's
 * unread-ticket poll and the Sales job history expect when there is nothing.
 */
const SESSION = {
  subjectId: 'subject-1',
  email: 'person@colt.net',
  name: 'A Person',
  department: null,
  companyName: null,
  roles: ['SalesAgent.User'],
  csrfToken: 'csrf',
  absoluteExpiresAt: '2030-01-01T00:00:00Z',
};

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const body = url.startsWith('/auth/session')
    ? SESSION
    : { jobs: [], tickets: [], unreadCount: 0 };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

function renderAt(path: string) {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

function requestedPaths(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

beforeEach(() => {
  leaveApp.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

/**
 * The first visit to a route compiles its lazy chunk, which on a cold cache
 * takes longer than Testing Library's 1 s default; the per-test timeout leaves
 * room for that wait (beyond Vitest's 5 s) on a slow runner.
 */
const LAZY_ROUTE = { timeout: 10_000 };
const TEST_TIMEOUT = 20_000;

describe('App', () => {
  it('signs in from /auth/session and renders Sales at /sales inside its own shell', async () => {
    renderAt('/sales');

    expect(
      await screen.findByRole('button', { name: /Run research/ }, LAZY_ROUTE),
    ).toBeInTheDocument();
    expect(requestedPaths()).toContain('/auth/session');

    // The app's own sidebar, with the way back to the hub as a full-page link.
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: 'AI Hub' })).toHaveAttribute('href', '/');
    expect(window.location.pathname).toBe('/sales');

    // Its own entries are client-side routes on the host path, with no prefix
    // added twice.
    fireEvent.click(within(nav).getByRole('button', { name: 'Job Tracker' }));
    await waitFor(() => expect(window.location.pathname).toBe('/sales/tracker'));
    expect(leaveApp).not.toHaveBeenCalled();
  }, TEST_TIMEOUT);

  it('serves the job tracker at /sales/tracker', async () => {
    renderAt('/sales/tracker');

    await waitFor(() =>
      expect(requestedPaths().some((path) => path.startsWith('/api/sales/v1/research/jobs'))).toBe(
        true,
      ),
      LAZY_ROUTE,
    );
    expect(window.location.pathname).toBe('/sales/tracker');
    expect(leaveApp).not.toHaveBeenCalled();
  }, TEST_TIMEOUT);
});
