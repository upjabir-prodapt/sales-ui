import { Activity, Users, Users2 } from 'lucide-react';
import type { ShellNavItem } from '@aicoe/aihub-platform/shell';
import type { UseCaseDescriptor } from '@aicoe/aihub-platform/usecases';

/**
 * Everything about this app that the platform package needs to be told: its
 * URL segment, its name, who may use it and its sidebar.
 *
 * `SLUG` must match `base` in vite.config.ts, `ARG SLUG` in the Dockerfile and
 * the load balancer's path rule.
 */
export const SLUG = 'sales';

/** The one path segment this app owns on the AI Hub host. */
export const BASE_PATH = `/${SLUG}`;

export const APP_LABEL = 'Sales Agent';

// Exactly the roles Apigee's aihub-api-v1 gate accepts for /sales/**, so the
// UI never offers what the gateway would then 403. `Sales.User` is not one of
// them and is deliberately absent; Platform.Admin is entitled to every app.
export const ROLE_SALES = ['SalesAgent.User', 'Platform.Admin'] as const;

/** The sidebar. Absolute host paths, see routes.tsx. */
export const NAV_ITEMS: readonly ShellNavItem[] = [
  { id: 'sales', label: 'Sales Agent', icon: Users, path: BASE_PATH, end: true },
  { id: 'sales-tracker', label: 'Job Tracker', icon: Activity, path: `${BASE_PATH}/tracker` },
];

/**
 * This app as the platform's `UseCasesContext` port expects it. The platform's
 * entitlement check (`useEntitlements`) reads `slug` and `roles`, and the
 * access-denied page reads `hub.name` to say what was refused.
 */
export const APP_DESCRIPTOR: UseCaseDescriptor = {
  slug: SLUG,
  roles: ROLE_SALES,
  nav: NAV_ITEMS,
  hub: {
    name: APP_LABEL,
    category: 'Revenue',
    description: 'Account research briefs built from public company signals.',
    tags: ['brief', 'pdf'],
    icon: Users2,
  },
};
