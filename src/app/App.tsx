import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { PlatformProviders } from '@aicoe/aihub-platform/shell';
import { UseCasesContext } from '@aicoe/aihub-platform/usecases';
import { SalesJobsProvider } from '../features/jobs/SalesJobsContext';
import { APP_DESCRIPTOR } from './config';
import { AppRoutes } from './routes';

/**
 * What the platform's entitlement check and access-denied page read through
 * their port: just this app. Module scope so the context value is stable
 * across renders.
 */
const USE_CASES = [APP_DESCRIPTOR];

/**
 * Provider order: the router outermost so the auth provider and route guards
 * can navigate, the registry and platform providers next, and the job registry
 * inside them because it reads the session.
 *
 * **SalesJobsProvider's position is load-bearing**: it mounts *above* the
 * routes, so a running job keeps polling when the user moves between
 * `/sales` and `/sales/tracker`. Moved inside a route element, navigating
 * away would unmount it and silently kill in-flight jobs.
 */
const App: React.FC = () => (
  <BrowserRouter>
    <UseCasesContext.Provider value={USE_CASES}>
      <PlatformProviders>
        <SalesJobsProvider>
          <AppRoutes />
        </SalesJobsProvider>
      </PlatformProviders>
    </UseCasesContext.Provider>
  </BrowserRouter>
);

export default App;
