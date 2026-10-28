import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { PlanScreen } from '@/screens/plan';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';
import { makeDay, makeTask, pagedTasks, taskToday } from '@/test/task-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

interface Call {
  path: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

describe('PlanScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let calls: Call[];

  beforeEach(async () => {
    mockPush.mockReset();
    fetchMock.mockReset();
    calls = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore
      .getState()
      .setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-09T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-09T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  /** Answers the task endpoints and records every request the screen makes. */
  function mockApi({
    day = () => jsonResponse(makeDay()),
    completion,
    list = () => jsonResponse(pagedTasks([])),
  }: {
    day?: () => Response | Promise<Response>;
    completion?: (attempt: number, body: Record<string, unknown>) => Response | Promise<Response>;
    list?: (view: string) => Response | Promise<Response>;
  } = {}) {
    let completions = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });

      if (url.pathname === '/api/tasks/today') {
        return day();
      }
      if (url.pathname === '/api/tasks' && (init?.method ?? 'GET') === 'GET') {
        return list(url.searchParams.get('view') ?? 'Today');
      }
      if (url.pathname.endsWith('/completion')) {
        completions += 1;
        const id = url.pathname.split('/')[3]!;
        return completion
          ? completion(completions, body ?? {})
          : jsonResponse(makeTask({ id, isCompleted: Boolean(body?.completed), completedAtUtc: body?.completed ? '2026-09-08T09:00:00Z' : null }));
      }
      if (url.pathname.startsWith('/api/tasks/') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      throw new TypeError(`No mock for ${init?.method ?? 'GET'} ${url.pathname}`);
    });
  }

  function renderScreen() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PlanScreen />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('leads with what is still open and keeps the fraction as support', async () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b', isCompleted: true }), makeTask({ id: 'c' }), makeTask({ id: 'd' }), makeTask({ id: 'e', isCompleted: true })];
    mockApi({ day: () => jsonResponse(makeDay({ tasks })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('task-summary-remaining')).toHaveTextContent('3 tapşırıq qalıb'));
    expect(view.getByTestId('task-summary-detail')).toHaveTextContent('2 / 5 tamamlanıb');
    // The share is drawn once, as a track — not repeated as a number beside it.
    expect(view.getByTestId('task-summary')).not.toHaveTextContent('%');
    expect(view.getByLabelText('Bu gün: 2 / 5 tamamlanıb')).toBeTruthy();
  });

  it('reads the supplied one-task day as "1 tapşırıq qalıb" over "0 / 1 tamamlanıb"', async () => {
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'a' })] })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('task-summary-remaining')).toHaveTextContent('1 tapşırıq qalıb'));
    expect(view.getByTestId('task-summary-detail')).toHaveTextContent('0 / 1 tamamlanıb');
    expect(view.queryByTestId('task-summary-overdue')).toBeNull();
  });

  it('scopes the success wording to today when overdue work is still open', async () => {
    const overdue = [makeTask({ id: 'late', plannedDate: '2026-09-05', isOverdue: true })];
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'a', isCompleted: true })], overdue })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('task-summary-remaining')).toHaveTextContent('Bu günün hamısı tamamlandı'));
    expect(view.getByTestId('task-summary-detail')).toHaveTextContent('1 / 1 tamamlanıb');
    // Finishing today says nothing about what is owed from before, so the overdue line stays.
    expect(view.getByTestId('task-summary-overdue')).toHaveTextContent('1 gecikmiş tapşırıq');
  });

  it('plans instead of reporting a zero when the day holds nothing but earlier days are owed', async () => {
    const overdue = [makeTask({ id: 'late', plannedDate: '2026-09-05', isOverdue: true }), makeTask({ id: 'late2', plannedDate: '2026-09-06', isOverdue: true })];
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [], overdue })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('task-summary-remaining')).toHaveTextContent('2 gecikmiş tapşırıq'));
    expect(view.getByTestId('task-summary-detail')).toHaveTextContent('Bu gün üçün yeni tapşırıq yoxdur.');
    // Nothing is scheduled today, so there is no fraction to draw and no 100% to fabricate.
    expect(view.getByTestId('task-summary')).not.toHaveTextContent('%');
    expect(view.getByTestId('today-empty')).toBeTruthy();
    // The number already leads the summary; it is not repeated underneath.
    expect(view.queryByTestId('task-summary-overdue')).toBeNull();
  });

  it('offers planning, not 0 / 0, on a completely empty day', async () => {
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [], counts: { scheduled: 0, completed: 0, overdue: 0 } })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('task-summary-remaining')).toHaveTextContent('Bu gün plan boşdur'));
    expect(view.getByTestId('task-summary-detail')).toHaveTextContent('Bu gün üçün tapşırıq planlaşdırın.');
    expect(view.getByTestId('task-summary')).not.toHaveTextContent('0 / 0');

    await fireEvent.press(view.getByTestId('task-summary-add'));
    expect(mockPush).toHaveBeenCalledWith(`/plan/new?date=${taskToday}`);
  });

  it('distinguishes a timed task from a date-only one without repeating the day', async () => {
    const tasks = [makeTask({ id: 'timed', title: 'Həkimə zəng et', plannedTime: '09:30:00' }), makeTask({ id: 'allday', title: 'Sənədləri hazırla' })];
    mockApi({ day: () => jsonResponse(makeDay({ tasks })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('task-meta-timed')).toHaveTextContent('09:30'));
    // An untimed task belongs to the day, and is not pretended to happen at midnight.
    expect(view.getByTestId('task-meta-allday')).toHaveTextContent('Gün ərzində');
    // "Bu gün" on every row of today's list says nothing; the header already carries the day.
    expect(view.getByTestId('task-meta-timed')).not.toHaveTextContent('Bu gün');
    expect(view.getByTestId('task-meta-allday')).not.toHaveTextContent('Bu gün');
  });

  it('draws priority for high and low and leaves the default unmarked', async () => {
    const tasks = [
      makeTask({ id: 'high', title: 'Vacib', priority: 'High' }),
      makeTask({ id: 'normal', title: 'Adi' }),
      makeTask({ id: 'low', title: 'Sonra', priority: 'Low' }),
    ];
    mockApi({ day: () => jsonResponse(makeDay({ tasks })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('task-row-high')).toHaveTextContent(/Yüksək/));
    expect(view.getByTestId('task-row-low')).toHaveTextContent(/Aşağı/);
    expect(view.getByTestId('task-row-normal')).not.toHaveTextContent(/Normal/);
    // Every priority is still spoken, so none of them depends on seeing a colour.
    expect(view.getByTestId('task-open-normal').props.accessibilityLabel).toContain('Normal prioritet');
    expect(view.getByTestId('task-open-high').props.accessibilityLabel).toContain('Yüksək prioritet');
  });

  it('says so plainly when the day holds nothing', async () => {
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [], counts: { scheduled: 0, completed: 0, overdue: 0 } })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByText('Bu gün üçün tapşırıq yoxdur')).toBeTruthy());
    expect(view.queryByTestId('overdue-section')).toBeNull();
  });

  it('separates overdue tasks and keeps the day they were planned for', async () => {
    const overdue = [makeTask({ id: 'late', title: 'Gecikmiş', plannedDate: '2026-09-05', isOverdue: true })];
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'now' })], overdue })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('overdue-section')).toBeTruthy());
    expect(view.getByTestId('overdue-count')).toHaveTextContent(/^1$/);
    // The original date stays visible rather than being folded into "today".
    expect(view.getByTestId('overdue-section')).toHaveTextContent(/Gecikib · 5 sen/);
    // The late task is counted apart from today's own progress.
    expect(view.getByTestId('task-summary-remaining')).toHaveTextContent('1 tapşırıq qalıb');
    expect(view.getByTestId('task-summary-detail')).toHaveTextContent('0 / 1 tamamlanıb');
    expect(view.getByTestId('task-summary-overdue')).toHaveTextContent(/1 gecikmiş tapşırıq/);
    // With an overdue section above it, today's own list says which tasks it holds.
    expect(view.getByTestId('today-section')).toHaveTextContent(/Bu gün/);
    // Each task is rendered once, in one section only.
    expect(view.getAllByTestId('task-row-late')).toHaveLength(1);
    expect(view.getAllByTestId('task-row-now')).toHaveLength(1);
  });

  it('sends the state the control moves to, not a toggle', async () => {
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'a' })] })) });
    const view = await renderScreen();
    await waitFor(() => view.getByTestId('task-toggle-a'));

    await fireEvent.press(view.getByTestId('task-toggle-a'));

    await waitFor(() => expect(calls.filter((call) => call.path.endsWith('/completion'))).toHaveLength(1));
    const request = calls.find((call) => call.path.endsWith('/completion'))!;
    expect(request.path).toBe('/api/tasks/a/completion');
    expect(request.body).toEqual({ completed: true });
  });

  it('ignores a second tap while the first completion is still in flight', async () => {
    let release: ((response: Response) => void) | undefined;
    mockApi({
      day: () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'a' })] })),
      completion: (attempt) =>
        attempt === 1
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : jsonResponse(makeTask({ id: 'a', isCompleted: true })),
    });
    const view = await renderScreen();
    await waitFor(() => view.getByTestId('task-toggle-a'));

    await fireEvent.press(view.getByTestId('task-toggle-a'));
    await waitFor(() => expect(calls.filter((call) => call.path.endsWith('/completion'))).toHaveLength(1));
    await fireEvent.press(view.getByTestId('task-toggle-a'));

    // The duplicate submit never reaches the network.
    expect(calls.filter((call) => call.path.endsWith('/completion'))).toHaveLength(1);
    release!(await jsonResponse(makeTask({ id: 'a', isCompleted: true })));
  });

  it('reports a failed completion and leaves the row as it was', async () => {
    mockApi({
      day: () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'a', title: 'Həkimə zəng et' })] })),
      completion: () => jsonResponse({ title: 'Server error' }, 500),
    });
    const view = await renderScreen();
    await waitFor(() => view.getByTestId('task-toggle-a'));

    await fireEvent.press(view.getByTestId('task-toggle-a'));

    await waitFor(() => expect(view.getByText(/Serverdə xəta baş verdi/)).toBeTruthy());
    // Nothing was assumed locally, so the task is still shown as not completed.
    expect(view.getByTestId('task-toggle-a').props.accessibilityState.checked).toBe(false);
  });

  it('keeps the figures on screen when a refresh fails', async () => {
    let attempts = 0;
    mockApi({
      day: () => {
        attempts += 1;
        return attempts === 1 ? jsonResponse(makeDay({ tasks: [makeTask({ id: 'a' })] })) : jsonResponse({ title: 'Server error' }, 500);
      },
    });
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('task-summary-detail')).toHaveTextContent('0 / 1 tamamlanıb'));

    await client.refetchQueries({ queryKey: ['tasks'] }).catch(() => undefined);

    await waitFor(() => expect(view.getByText(/köhnə ola bilər/)).toBeTruthy());
    // The cached figure is still there, with an honest notice above it.
    expect(view.getByTestId('task-summary-detail')).toHaveTextContent('0 / 1 tamamlanıb');
  });

  it('switches to the upcoming view and groups it by day', async () => {
    mockApi({
      day: () => jsonResponse(makeDay()),
      list: (view) =>
        view === 'Upcoming'
          ? jsonResponse(pagedTasks([makeTask({ id: 'x', title: 'Sabah', plannedDate: '2026-09-09' }), makeTask({ id: 'y', title: 'Sonra', plannedDate: '2026-09-11' })]))
          : jsonResponse(pagedTasks([])),
    });
    const view = await renderScreen();
    await waitFor(() => view.getByTestId('plan-view'));

    await fireEvent.press(view.getByRole('radio', { name: 'Qarşıdakı' }));

    await waitFor(() => expect(view.getByTestId('upcoming-2026-09-09')).toBeTruthy());
    expect(view.getByTestId('upcoming-2026-09-11')).toBeTruthy();
    expect(view.getByTestId('upcoming-2026-09-09')).toHaveTextContent(/Sabah/);
  });

  it('shows completed tasks in their own view', async () => {
    mockApi({
      day: () => jsonResponse(makeDay()),
      list: (view) => (view === 'Completed' ? jsonResponse(pagedTasks([makeTask({ id: 'z', title: 'Bitdi', isCompleted: true, completedAtUtc: '2026-09-08T08:00:00Z' })])) : jsonResponse(pagedTasks([]))),
    });
    const view = await renderScreen();
    await waitFor(() => view.getByTestId('plan-view'));

    await fireEvent.press(view.getByRole('radio', { name: 'Tamamlananlar' }));

    await waitFor(() => expect(view.getByTestId('completed-section')).toHaveTextContent(/Bitdi/));
    expect(view.getByTestId('task-toggle-z').props.accessibilityState.checked).toBe(true);
    // Grouped by the day it was finished, with the day it had been planned for still on the row.
    expect(view.getByTestId('completed-2026-09-08')).toBeTruthy();
    expect(view.getByTestId('task-meta-z')).toHaveTextContent('Plan: 8 sen');
  });

  it('keeps a long title readable beside the checkbox and the overflow control', async () => {
    const title = 'Sabah səhər klinikaya zəng edib analiz nəticələrini soruş və lazım gələrsə yeni vaxt təyin et';
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'long', title, plannedTime: '08:00:00' })] })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByText(title)).toBeTruthy());
    // It wraps rather than being cut to a stub, and the three controls stay separate targets.
    expect(view.getByText(title).props.numberOfLines).toBe(3);
    expect(view.getByTestId('task-toggle-long')).toBeTruthy();
    expect(view.getByTestId('task-more-long')).toBeTruthy();
    expect(view.getByTestId('task-meta-long')).toHaveTextContent('08:00');
  });

  it('shows a recurring occurrence as repeating without losing its own day', async () => {
    const task = makeTask({ id: 'rep', title: 'Dərman', seriesId: 'series-1', seriesKind: 'Daily', plannedTime: '21:00:00' });
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [task] })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('task-row-rep')).toHaveTextContent(/Təkrarlanan/));
    expect(view.getByTestId('task-meta-rep')).toHaveTextContent('21:00');
    expect(view.getByTestId('task-open-rep').props.accessibilityLabel).toContain('təkrarlanan');

    // The series can be stopped from the row's own menu, with its own confirmation.
    await fireEvent.press(view.getByTestId('task-more-rep'));
    await waitFor(() => view.getByTestId('task-stop-series'));
  });

  it('opens the create form from the header', async () => {
    mockApi();
    const view = await renderScreen();
    // The day the form should open on comes from the API, so wait for it rather than assuming the device's.
    await waitFor(() => view.getByTestId('task-summary'));

    await fireEvent.press(view.getByTestId('plan-add'));

    expect(mockPush).toHaveBeenCalledWith(`/plan/new?date=${taskToday}`);
  });

  it('deletes a task after confirmation', async () => {
    mockApi({ day: () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'a' })] })) });
    const view = await renderScreen();
    await waitFor(() => view.getByTestId('task-more-a'));

    await fireEvent.press(view.getByTestId('task-more-a'));
    await waitFor(() => view.getByTestId('task-delete'));
    await fireEvent.press(view.getByTestId('task-delete'));

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/tasks/a')).toBe(true));
  });
});
