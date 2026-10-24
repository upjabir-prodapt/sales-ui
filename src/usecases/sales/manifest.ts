import { lazy } from 'react';
import { Activity, Users, Users2 } from 'lucide-react';
import type { UseCaseManifest } from '../base';
import { salesJobSource } from './jobSource';
import { SalesJobsProvider } from './SalesJobsContext';

// Exactly the roles Apigee's aihub-api-v1 gate accepts for /sales/**, so the
// UI never offers what the gateway would then 403. `Sales.User` is not one of
// them and is deliberately absent; Platform.Admin is entitled to every vertical.
export const ROLE_SALES = ['SalesAgent.User', 'Platform.Admin'] as const;

export const manifest: UseCaseManifest = {
  slug: 'sales',
  order: 20,
  roles: ROLE_SALES,
  routes: [
    { path: 'sales', component: lazy(() => import('./SalesRoute')) },
    { path: 'sales/tracker', component: lazy(() => import('./SalesTrackerRoute')) },
  ],
  // The sidebar while inside Sales — identical in the hub today and in the
  // standalone Sales app after the split.
  nav: [
    { id: 'sales', label: 'Sales Agent', icon: Users, path: '/sales', end: true },
    { id: 'sales-tracker', label: 'Job Tracker', icon: Activity, path: '/sales/tracker' },
  ],
  jobSource: salesJobSource,
  // Must outlive navigation, same as translation's.
  Provider: SalesJobsProvider,
  hub: {
    name: 'Sales Agent',
    category: 'Revenue',
    description: 'Account research briefs built from public company signals.',
    tags: ['brief', 'pdf'],
    icon: Users2,
  },
};
