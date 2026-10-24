import { describe, expect, it } from 'vitest';
import { APP_DESCRIPTOR, BASE_PATH, NAV_ITEMS, ROLE_SALES, SLUG } from './config';

/**
 * The entitlement list must equal the roles Apigee's gate accepts for
 * /sales/**, no more and no fewer: an extra role renders a page the gateway then
 * 403s, a missing one locks out someone the gateway would let in.
 * Platform.Admin is entitled to every app.
 */
describe('sales roles match the Apigee gate', () => {
  it('is entitled to exactly SalesAgent.User and Platform.Admin', () => {
    expect([...ROLE_SALES].sort()).toEqual(['SalesAgent.User', 'Platform.Admin'].sort());
    // What the platform's entitlement check reads must be the same list.
    expect(APP_DESCRIPTOR.slug).toBe(SLUG);
    expect(APP_DESCRIPTOR.roles).toBe(ROLE_SALES);
  });

  it('keeps every sidebar entry inside the app', () => {
    expect(BASE_PATH).toBe('/sales');
    for (const item of NAV_ITEMS) {
      expect(item.path === BASE_PATH || item.path.startsWith(`${BASE_PATH}/`)).toBe(true);
    }
  });
});
