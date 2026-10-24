import React, { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AccessDenied, RequireRole } from '@aicoe/aihub-platform/auth';
import { AppShell, pathMatches } from '@aicoe/aihub-platform/shell';
import { APP_LABEL, BASE_PATH, NAV_ITEMS, ROLE_SALES, SLUG } from './config';
import { leaveApp } from './leaveApp';

/**
 * This app's routes.
 *
 * There is deliberately NO router `basename`. The routes (`sales/tracker`),
 * the sidebar entries (`/sales/tracker`) and the pages' own links
 * (`navigate('/sales/tracker')`) are all written as paths on the shared host,
 * because the hub and every other app sit behind the same load balancer. A
 * basename of `/sales` would prefix every one of them a second time
 * (`/sales/sales`). The load balancer only ever sends `/sales/*` here, so host
 * paths and router paths are the same thing.
 *
 * Two consequences handled below:
 *
 *   `/denied`  RequireRole redirects to the absolute `/denied`, which on this
 *              host belongs to the hub. It is forwarded to `/sales/denied` so
 *              the page stays in this app (and survives a reload here).
 *   other      A client-side navigation out of `/sales` (e.g. the page's
 *              "back" calling `navigate('/')`) cannot be rendered by this app,
 *              so it becomes a full-page load that the load balancer routes
 *              to whichever app owns that path.
 */

// Each page is its own chunk; nothing loads until its route is hit.
const SalesAgentPage = lazy(() => import('../pages/SalesAgentPage'));
const TrackerPage = lazy(() => import('../pages/TrackerPage'));

/** `/sales`: the landing page, with its links into the tracker and back to the hub. */
const SalesHome: React.FC = () => {
  const navigate = useNavigate();
  return (
    <SalesAgentPage
      onOpenTracker={() => navigate(`${BASE_PATH}/tracker`)}
      onBack={() => navigate('/')}
    />
  );
};

/**
 * `null` matches RequireRole, which also renders nothing rather than flashing
 * a spinner between the session probe and the first paint.
 */
const Lazy: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

/** Keeps RequireRole's `state.service` so the page can name what was refused. */
const DeniedRedirect: React.FC = () => {
  const location = useLocation();
  return <Navigate to={`${BASE_PATH}/denied`} replace state={location.state} />;
};

/** No route matched: back to the app root, or out to the app that owns the path. */
const Unmatched: React.FC = () => {
  const { pathname, search, hash } = useLocation();
  const inside = pathMatches(pathname, BASE_PATH, false);

  useEffect(() => {
    if (!inside) leaveApp(`${pathname}${search}${hash}`);
  }, [inside, pathname, search, hash]);

  return inside ? <Navigate to={BASE_PATH} replace /> : null;
};

export const AppRoutes: React.FC = () => (
  <Routes>
    <Route
      element={
        <AppShell appSlug={SLUG} basePath={BASE_PATH} appLabel={APP_LABEL} navItems={NAV_ITEMS} />
      }
    >
      <Route element={<RequireRole anyOf={ROLE_SALES} service={SLUG} />}>
        <Route
          path={SLUG}
          element={
            <Lazy>
              <SalesHome />
            </Lazy>
          }
        />
        <Route
          path={`${SLUG}/tracker`}
          element={
            <Lazy>
              <TrackerPage />
            </Lazy>
          }
        />
      </Route>

      <Route path={`${BASE_PATH}/denied`} element={<AccessDenied />} />
    </Route>

    <Route path="/denied" element={<DeniedRedirect />} />
    <Route path="*" element={<Unmatched />} />
  </Routes>
);
