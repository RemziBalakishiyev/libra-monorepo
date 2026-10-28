import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useAppearanceStore } from '@/lib/appearance-store';
import { useSessionStore } from '@/lib/session-store';
import { Home, heroLine, initialsOf, preferredName, todayLabelIn } from '@/screens/home';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { cashAccount, dashboard, fetchByPath, jsonResponse } from '@/test/finance-fixtures';
import { breakfastEntry, nutritionDay } from '@/test/nutrition-fixtures';
import { makeOpenSession, makeSession, makeSummary } from '@/test/sleep-fixtures';
import { makeDay, makeTask } from '@/test/task-fixtures';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
    // The screen is "focused" for as long as it is mounted, which is what the real hook reports on the active tab.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const profile = {
  id: 'user-1',
  email: 'ayan.mammadova-very-long-name@example.com',
  displayName: 'Ayan Məmmədova-Hüseynzadə',
  createdAtUtc: '2026-09-01T00:00:00Z',
  preferences: { timeZone: 'Asia/Baku', locale: 'az-AZ', currency: 'AZN' },
};

describe('Home helpers', () => {
  it('greets by the first name, keeps the stored name for the avatar, and falls back to the e-mail', () => {
    expect(preferredName('Ayan Məmmədova-Hüseynzadə', 'x@example.com')).toBe('Ayan');
    expect(preferredName('  İlkin  ', 'x@example.com')).toBe('İlkin');
    expect(preferredName(null, 'remzi@example.com')).toBe('remzi');
    expect(initialsOf('Ayan Məmmədova-Hüseynzadə')).toBe('AM');
    expect(initialsOf('ilkin')).toBe('İ');
  });

  it('names today in the profile time zone, not the device one', () => {
    // 21:30 UTC on the 18th is already the 19th in Baku (UTC+4) and still the 18th in Honolulu.
    const instant = new Date('2026-09-18T21:30:00Z');
    expect(todayLabelIn('Asia/Baku', instant)).toBe('Şənbə, 19 sentyabr');
    expect(todayLabelIn('Pacific/Honolulu', instant)).toBe('Cümə, 18 sentyabr');
  });

  it('derives the hero line from the day summary and stays neutral without data', () => {
    expect(heroLine(undefined, 'pending')).toBe('Bu günün planı yüklənir…');
    expect(heroLine(undefined, 'error')).toBe('Plan məlumatı hazırda yüklənmir.');
    expect(heroLine(makeDay({ counts: { scheduled: 0, completed: 0, overdue: 0 } }), 'ready')).toBe('Bu gün üçün hələ qeyd yoxdur.');
    expect(heroLine(makeDay({ counts: { scheduled: 3, completed: 1, overdue: 0 } }), 'ready')).toBe('Bu gün 2 tapşırıq qalıb');
    expect(heroLine(makeDay({ counts: { scheduled: 3, completed: 1, overdue: 2 } }), 'ready')).toBe('Bu gün 2 tapşırıq qalıb · 2 gecikib');
    expect(heroLine(makeDay({ counts: { scheduled: 2, completed: 2, overdue: 0 } }), 'ready')).toBe('Bu günün 2 tapşırığının hamısı tamamlanıb');
    expect(heroLine(makeDay({ counts: { scheduled: 0, completed: 0, overdue: 1 } }), 'ready')).toBe('Bu gün üçün plan yoxdur · 1 gecikmiş tapşırıq');
  });
});

describe('Home', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
    mockPush.mockReset();
    mockNavigate.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-07T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-07T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => {
    client.clear();
    useAppearanceStore.setState({ preference: 'light' });
  });

  function renderHome() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Home />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  const fullRoutes = {
    '/api/profile': () => jsonResponse(profile),
    '/api/finance/accounts': () => jsonResponse([cashAccount]),
    '/api/finance/dashboard': () => jsonResponse(dashboard),
    '/api/nutrition/day': () => jsonResponse(nutritionDay()),
    '/api/tasks/today': () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'a', title: 'Süd al' }), makeTask({ id: 'b', title: 'Hesabatı göndər', isCompleted: true })] })),
    '/api/sleep/summary': () => jsonResponse(makeSummary({ latest: makeSession({ id: 'last' }) })),
  };

  it('shows real figures on the four cards, the day sentence in the hero, and opens Quick Add from the hero', async () => {
    fetchMock.mockImplementation(fetchByPath(fullRoutes));
    const view = await renderHome();

    // First name in the greeting; the stored name stays on the profile control.
    expect(await view.findByText('Salam, Ayan')).toBeTruthy();
    expect(view.getByLabelText('Profil: Ayan Məmmədova-Hüseynzadə')).toBeTruthy();
    expect(view.getByTestId('home-profile')).toHaveTextContent('AM');

    expect(await view.findByText('Bu gün 1 tapşırıq qalıb')).toBeTruthy();
    // Balance and the month's net flow are both shown, and labelled as what they are.
    expect(view.getByLabelText('Hesab balansı 250,50 AZN')).toBeTruthy();
    expect(view.getByText(/Balans · bu ayın xalis axını 250,50 AZN/)).toBeTruthy();
    expect(await view.findByText('695 / 2.200 kkal')).toBeTruthy();
    expect(view.getByRole('progressbar', { name: 'Enerji hədəfi: 32%' })).toBeTruthy();
    expect(await view.findByText('1 / 2')).toBeTruthy();
    expect(view.getByRole('progressbar', { name: 'Bu günün tapşırıqları: 50%' })).toBeTruthy();
    expect((await view.findByTestId('home-card-sleep-value')).props.children.props.children).toBe('8 s 30 d');
    expect(view.getByText('Son yuxu · 10 sen')).toBeTruthy();
    // Nothing on Home advertises the AI assistant as working.
    expect(view.queryByText(/AI/)).toBeNull();

    // Each card opens its module.
    await fireEvent.press(view.getByTestId('home-card-nutrition-open'));
    expect(mockNavigate).toHaveBeenCalledWith('/nutrition');
    await fireEvent.press(view.getByTestId('home-card-sleep-open'));
    expect(mockPush).toHaveBeenCalledWith('/sleep');

    // The hero's action is the global Quick Add: all six actions once Finance exists.
    await fireEvent.press(view.getByRole('button', { name: 'Qeyd əlavə et' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Gəlir' }));
    expect(mockPush).toHaveBeenCalledWith('/finance/transactions/new?type=Income');
  });

  it('completes a task from Home through the completion endpoint and lists overdue tasks with their date', async () => {
    const posts: { path: string; body: { completed: boolean } }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        posts.push({ path, body: JSON.parse(init.body as string) });
        return jsonResponse(makeTask({ id: 'a', title: 'Süd al', isCompleted: true }));
      }
      if (path === '/api/tasks/today') {
        return jsonResponse(
          makeDay({
            tasks: [makeTask({ id: 'a', title: 'Süd al' })],
            overdue: [makeTask({ id: 'old', title: 'Kirayəni ödə', plannedDate: '2026-09-05', isOverdue: true })],
            counts: { scheduled: 1, completed: 0, overdue: 1 },
          }),
        );
      }
      const route = fullRoutes[path as keyof typeof fullRoutes];
      if (route) {
        return route();
      }
      throw new TypeError(`No mock for ${path}`);
    });
    const view = await renderHome();

    // Overdue first, labelled with the day it was planned for; the count stays a separate, labelled figure.
    expect(await view.findByTestId('home-task-old')).toHaveTextContent(/Gecikib · 5 sen/);
    expect(view.getByText('1 gecikib')).toBeTruthy();
    expect(await view.findByText('Bu gün 1 tapşırıq qalıb · 1 gecikib')).toBeTruthy();

    const toggle = view.getByRole('checkbox', { name: 'Süd al: tamamlanmayıb' });
    expect(toggle.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(toggle);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: '/api/tasks/a/completion', body: { completed: true } });

    await fireEvent.press(view.getByTestId('home-task-open-old'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/plan/[id]', params: { id: 'old' } });
  });

  it('tells "no record" apart from a real zero, labels a sub-minute night, and keeps Quick Add before Finance exists', async () => {
    fetchMock.mockImplementation(
      fetchByPath({
        '/api/profile': () => jsonResponse({ ...profile, displayName: null, email: 'remzi@example.com' }),
        '/api/finance/accounts': () => jsonResponse([]),
        '/api/finance/dashboard': () => jsonResponse(dashboard),
        // One meal that happens to add up to nothing is a zero, not a missing record.
        '/api/nutrition/day': () => jsonResponse(nutritionDay([{ ...breakfastEntry, energyKcal: 0, proteinGrams: 0, carbGrams: 0, fatGrams: 0 }], null)),
        '/api/tasks/today': () => jsonResponse(makeDay({ tasks: [], counts: { scheduled: 0, completed: 0, overdue: 0 } })),
        // Forty seconds of recorded sleep: never "0 d", never rounded up to a minute.
        '/api/sleep/summary': () => jsonResponse(makeSummary({ latest: makeSession({ id: 'short', startedAtUtc: '2026-09-10T03:29:20Z', endedAtUtc: '2026-09-10T03:30:00Z', durationMinutes: 1 }) })),
      }),
    );
    const view = await renderHome();

    expect(await view.findByText('Salam, remzi')).toBeTruthy();
    expect(await view.findByText('Bu gün üçün hələ qeyd yoxdur.')).toBeTruthy();
    // Finance: no account → no record, with the one useful action.
    expect(await view.findByTestId('home-card-finance-empty')).toBeTruthy();
    await fireEvent.press(view.getByTestId('home-card-finance-action'));
    expect(mockPush).toHaveBeenCalledWith('/finance/setup');
    // Nutrition: a genuine zero is a number, with no target to be a fraction of.
    expect(await view.findByText('0 kkal')).toBeTruthy();
    expect(view.getByText('Bu gün · hədəf təyin edilməyib')).toBeTruthy();
    expect(view.queryByTestId('home-card-nutrition-empty')).toBeNull();
    // Plan: nothing scheduled → no record and a create action.
    expect(view.getByTestId('home-card-plan-empty')).toBeTruthy();
    await fireEvent.press(view.getByTestId('home-card-plan-action'));
    expect(mockPush).toHaveBeenCalledWith('/plan/new');
    // Sleep: the short night is stated plainly.
    expect(view.getByLabelText(/Yuxu, son yuxu .*, bir dəqiqədən az/)).toBeTruthy();
    expect(view.getByText('1 dəq-dən az')).toBeTruthy();
    // The task section offers creation rather than an empty list.
    await fireEvent.press(view.getByTestId('home-tasks-create'));
    expect(mockPush).toHaveBeenLastCalledWith('/plan/new');

    // Neither a meal nor a task needs an account, so Quick Add offers exactly those before setup.
    await fireEvent.press(view.getByRole('button', { name: 'Qeyd əlavə et' }));
    expect(view.queryByRole('button', { name: 'Xərc' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Köçürmə' })).toBeNull();
    expect(await view.findByRole('button', { name: 'Tapşırıq' })).toBeTruthy();
    await fireEvent.press(await view.findByRole('button', { name: 'Yemək' }));
    expect(mockPush).toHaveBeenCalledWith('/nutrition/new');
  });

  it('shows a missing sleep record as "Qeyd yoxdur" and a running night as such, never as zero sleep', async () => {
    let summary = makeSummary({ latest: null, active: null, days: [] });
    fetchMock.mockImplementation(fetchByPath({ ...fullRoutes, '/api/sleep/summary': () => jsonResponse(summary) }));
    const view = await renderHome();

    expect(await view.findByTestId('home-card-sleep-empty')).toBeTruthy();
    expect(view.queryByText('0 d')).toBeNull();
    await fireEvent.press(view.getByTestId('home-card-sleep-action'));
    expect(mockPush).toHaveBeenCalledWith('/sleep/new');

    summary = makeSummary({ latest: null, active: makeOpenSession({ id: 'open', startedAtUtc: new Date(Date.now() - 90 * 60_000).toISOString() }) });
    await client.invalidateQueries();
    expect(await view.findByText('Davam edir')).toBeTruthy();
    expect(view.getByText(/1 s 30 d · yuxu davam edir/)).toBeTruthy();
  });

  it('keeps the other cards when one module fails, and offers a retry on the failed card', async () => {
    let attempts = 0;
    fetchMock.mockImplementation(
      fetchByPath({
        ...fullRoutes,
        '/api/sleep/summary': () => {
          attempts += 1;
          return attempts === 1 ? jsonResponse({ title: 'Server error', status: 500 }, 500) : jsonResponse(makeSummary({ latest: makeSession({ id: 'last' }) }));
        },
      }),
    );
    const view = await renderHome();

    expect(await view.findByLabelText('Yuxu, yüklənmədi')).toBeTruthy();
    expect(view.getByLabelText('Hesab balansı 250,50 AZN')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Yenidən cəhd et' }));
    expect(await view.findByText('Son yuxu · 10 sen')).toBeTruthy();
  });

  it('renders the same structure in dark mode and hides the hero action on the wide layout where the sidebar has it', async () => {
    useAppearanceStore.setState({ preference: 'dark' });
    fetchMock.mockImplementation(fetchByPath(fullRoutes));
    const view = await renderHome();

    expect(await view.findByTestId('home-hero')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Qeyd əlavə et' })).toBeTruthy();
    expect(view.getByRole('header', { name: 'Gününə bir baxış' })).toBeTruthy();
    expect(view.getByTestId('home-cards')).toBeTruthy();
    expect(view.getByTestId('home-tasks')).toBeTruthy();
  });
});
