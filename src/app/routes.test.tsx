import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@aicoe/aihub-platform/i18n';
import { AuthContext, type AuthState } from '@aicoe/aihub-platform/auth';
import { UseCasesContext } from '@aicoe/aihub-platform/usecases';
import { APP_DESCRIPTOR } from './config';
import { AppRoutes } from './routes';

const leaveApp = vi.fn();
vi.mock('./leaveApp', () => ({ leaveApp: (url: string) => leaveApp(url) }));

// Stand-in pages, so these tests pin the routing and nothing the pages do.
vi.mock('../pages/SalesAgentPage', () => ({
  default: ({ onOpenTracker, onBack }: { onOpenTracker?: () => void; onBack?: () => void }) => (
    <div>
      <p>sales home</p>
      <button onClick={onOpenTracker}>open tracker</button>
      <button onClick={onBack}>back to hub</button>
    </div>
  ),
}));
vi.mock('../pages/TrackerPage', () => ({ default: () => <p>sales tracker</p> }));

/**
 * The app mounts its routes without a router basename, so its host-absolute
 * paths work unchanged. These pin where `/denied` lands and what happens to a
 * path the app does not own.
 */

function authAs(roles: string[]): AuthState {
  return {
    status: 'authenticated',
    user: {
      subjectId: 'subject-1',
      email: 'person@colt.net',
      name: 'A Person',
      department: null,
      companyName: null,
      roles,
      csrfToken: 'csrf',
      absoluteExpiresAt: '2030-01-01T00:00:00Z',
    },
    error: null,
    roles,
    hasRole: (...wanted: string[]) => wanted.some((role) => roles.includes(role)),
    refresh: async () => {},
    logout: async () => {},
  };
}

const CurrentPath: React.FC = () => <output data-testid="path">{useLocation().pathname}</output>;

function renderAt(path: string, roles: string[]) {
  return render(
    <AuthContext.Provider value={authAs(roles)}>
      <UseCasesContext.Provider value={[APP_DESCRIPTOR]}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
          <CurrentPath />
        </MemoryRouter>
      </UseCasesContext.Provider>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  leaveApp.mockReset();
  // The shell's user menu polls the hub's unread-ticket count.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tickets: [], unreadCount: 0 }), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
});

describe('AppRoutes', () => {
  it('renders the tracker at its host path, inside the app shell', async () => {
    renderAt('/sales/tracker', ['SalesAgent.User']);

    expect(await screen.findByText('sales tracker')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI Hub' })).toHaveAttribute('href', '/');
  });

  it("follows the landing page's tracker link without leaving the app", async () => {
    renderAt('/sales', ['SalesAgent.User']);

    fireEvent.click(await screen.findByRole('button', { name: 'open tracker' }));
    expect(await screen.findByText('sales tracker')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/sales\/tracker$/);
    expect(leaveApp).not.toHaveBeenCalled();
  });

  it("turns the landing page's back link into a full page load of the hub", async () => {
    renderAt('/sales', ['SalesAgent.User']);

    fireEvent.click(await screen.findByRole('button', { name: 'back to hub' }));
    await waitFor(() => expect(leaveApp).toHaveBeenCalledWith('/'));
  });

  it('lets Platform.Admin in', async () => {
    renderAt('/sales', ['Platform.Admin']);

    expect(await screen.findByText('sales home')).toBeInTheDocument();
  });

  it('keeps a refused user inside the app at /sales/denied', async () => {
    renderAt('/sales', ['Sales.User']);

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/sales/denied'));
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/permission to access Sales Agent/)).toBeInTheDocument();
    expect(screen.queryByText('sales home')).not.toBeInTheDocument();
    expect(leaveApp).not.toHaveBeenCalled();
  });

  it('sends an unknown path under the app back to its root', async () => {
    renderAt('/sales/no/such/page', ['SalesAgent.User']);

    expect(await screen.findByText('sales home')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/sales$/);
  });

  it('hands a path outside the app to a full page load', async () => {
    renderAt('/support?usecase=sales', ['SalesAgent.User']);

    await waitFor(() => expect(leaveApp).toHaveBeenCalledWith('/support?usecase=sales'));
  });
});
