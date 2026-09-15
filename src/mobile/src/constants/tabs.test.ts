import { tabs } from '@/constants/tabs';
import { routeGuards } from '@/lib/route-guards';

describe('tab shell', () => {
  it('defines the five stable tabs in order with Azerbaijani titles', () => {
    expect(tabs.map((tab) => tab.name)).toEqual(['index', 'finance', 'nutrition', 'plan', 'ai']);
    expect(tabs.map((tab) => tab.title)).toEqual(['Ana səhifə', 'Maliyyə', 'Qidalanma', 'Plan', 'AI']);
  });

  it('marks only AI as a placeholder now that plan is live', () => {
    expect(tabs.filter((tab) => tab.placeholder).map((tab) => tab.name)).toEqual(['ai']);
    expect(tabs.find((tab) => tab.name === 'nutrition')?.placeholder).toBe(false);
    expect(tabs.find((tab) => tab.name === 'plan')?.placeholder).toBe(false);
  });
});

describe('routeGuards', () => {
  it('exposes the app group only when signed in and the auth group only when signed out', () => {
    expect(routeGuards('signedIn')).toEqual({ app: true, auth: false });
    expect(routeGuards('signedOut')).toEqual({ app: false, auth: true });
    expect(routeGuards('loading')).toEqual({ app: false, auth: false });
  });
});
