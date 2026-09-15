import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { TaskFormScreen } from '@/screens/plan/task-form';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';
import { makeDetail, makeTask, taskToday } from '@/test/task-fixtures';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
}));

jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

interface Call {
  path: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

describe('TaskFormScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let calls: Call[];

  beforeEach(async () => {
    mockBack.mockReset();
    fetchMock.mockReset();
    calls = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore
      .getState()
      .setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-09T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-09T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  function mockApi({ tasks = {}, onCreate, onUpdate }: { tasks?: Record<string, unknown>; onCreate?: (attempt: number) => Response; onUpdate?: (attempt: number) => Response } = {}) {
    let creates = 0;
    let updates = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });

      const match = /^\/api\/tasks\/([^/]+)$/.exec(url.pathname);
      if (match && (init?.method ?? 'GET') === 'GET') {
        const task = tasks[match[1]!];
        return task ? jsonResponse(task) : jsonResponse({ title: 'Task not found' }, 404);
      }
      if (url.pathname === '/api/tasks' && init?.method === 'POST') {
        creates += 1;
        return onCreate ? onCreate(creates) : jsonResponse(makeTask({ id: 'created' }), 201);
      }
      if (match && init?.method === 'PUT') {
        updates += 1;
        return onUpdate ? onUpdate(updates) : jsonResponse(makeTask({ id: match[1]!, ...(body ?? {}) }));
      }
      if (match && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      throw new TypeError(`No mock for ${init?.method ?? 'GET'} ${url.pathname}`);
    });
  }

  function renderForm(props: Parameters<typeof TaskFormScreen>[0] = {}) {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <TaskFormScreen {...props} />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  const posts = () => calls.filter((call) => call.path === '/api/tasks' && call.method === 'POST');

  it('needs only a title: the date and priority arrive ready', async () => {
    mockApi();
    const view = await renderForm({ date: taskToday });

    // The optional fields are behind their own disclosures, so the first screen is short.
    expect(view.getByTestId('task-add-time')).toBeTruthy();
    expect(view.getByTestId('task-add-note')).toBeTruthy();
    expect(view.getByTestId('task-add-recurrence')).toBeTruthy();

    await fireEvent.changeText(view.getByTestId('task-title'), 'Həkimə zəng et');
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body).toMatchObject({
      title: 'Həkimə zəng et',
      plannedDate: taskToday,
      plannedTime: null,
      priority: 'Normal',
      note: null,
    });
    expect(posts()[0]!.body!.clientRequestId).toEqual(expect.any(String));
  });

  it('reports a missing title next to its field and sends nothing', async () => {
    mockApi();
    const view = await renderForm();

    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(view.getByText('Tapşırığın adını yazın.')).toBeTruthy());
    expect(posts()).toHaveLength(0);
  });

  it('refuses a title of only spaces', async () => {
    mockApi();
    const view = await renderForm();

    await fireEvent.changeText(view.getByTestId('task-title'), '    ');
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(view.getByText('Tapşırığın adını yazın.')).toBeTruthy());
    expect(posts()).toHaveLength(0);
  });

  it('sends the note and priority, and leaves an untouched time unset', async () => {
    mockApi();
    const view = await renderForm({ date: taskToday });

    // The time control appears only once it is asked for; until then the task is due by the end of its day.
    expect(view.queryByLabelText(/^Saat:/)).toBeNull();
    await fireEvent.press(view.getByTestId('task-add-time'));
    expect(view.getByLabelText(/^Saat:/)).toBeTruthy();

    await fireEvent.changeText(view.getByTestId('task-title'), 'Dərman');
    await fireEvent.press(view.getByTestId('task-add-note'));
    await fireEvent.changeText(view.getByTestId('task-note'), '  səhər  ');
    await fireEvent.press(view.getByRole('radio', { name: 'Yüksək' }));
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    // A revealed but untouched time stays empty rather than becoming a value nobody chose.
    expect(posts()[0]!.body).toMatchObject({ plannedTime: null, note: 'səhər', priority: 'High' });
  });

  it('keeps a time the task already had when it is edited', async () => {
    const task = makeTask({ id: 't4', plannedTime: '09:30:00' });
    mockApi({ tasks: { t4: makeDetail(task) } });
    const view = await renderForm({ id: 't4' });

    await waitFor(() => expect(view.getByTestId('task-title').props.value).toBe(task.title));
    await fireEvent.changeText(view.getByTestId('task-title'), 'Dərman qəbul et');
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'PUT')!.body).toMatchObject({ plannedTime: '09:30:00' });
  });

  it('asks for a weekday before it will save a weekly schedule', async () => {
    mockApi();
    const view = await renderForm({ date: taskToday });

    await fireEvent.changeText(view.getByTestId('task-title'), 'İdman');
    await fireEvent.press(view.getByTestId('task-add-recurrence'));
    await fireEvent.press(view.getByRole('radio', { name: 'Həftəlik' }));
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(view.getByText('Ən azı bir gün seçin.')).toBeTruthy());
    expect(posts()).toHaveLength(0);

    await fireEvent.press(view.getByTestId('weekday-1'));
    await fireEvent.press(view.getByTestId('weekday-4'));
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body!.recurrence).toMatchObject({ kind: 'Weekly', weekdays: [1, 4], startDate: taskToday });
  });

  it('sends a daily schedule without weekdays', async () => {
    mockApi();
    const view = await renderForm({ date: taskToday });

    await fireEvent.changeText(view.getByTestId('task-title'), 'Su iç');
    await fireEvent.press(view.getByTestId('task-add-recurrence'));
    await fireEvent.press(view.getByRole('radio', { name: 'Hər gün' }));
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body!.recurrence).toMatchObject({ kind: 'Daily', startDate: taskToday, endDate: null });
  });

  it('keeps everything typed when the save fails, and retries under the same key', async () => {
    mockApi({ onCreate: (attempt) => (attempt === 1 ? jsonResponse({ title: 'Server error' }, 500) : jsonResponse(makeTask({ id: 'created' }), 201)) });
    const view = await renderForm({ date: taskToday });

    await fireEvent.changeText(view.getByTestId('task-title'), 'Uzun bir tapşırıq adı');
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(view.getByText(/Serverdə xəta baş verdi/)).toBeTruthy());
    // Nothing has to be typed twice.
    expect(view.getByTestId('task-title').props.value).toBe('Uzun bir tapşırıq adı');

    await fireEvent.press(view.getByTestId('task-submit'));
    await waitFor(() => expect(posts()).toHaveLength(2));
    // The retry carries the first attempt's key, so a lost response cannot become a second task.
    expect(posts()[1]!.body!.clientRequestId).toBe(posts()[0]!.body!.clientRequestId);
  });

  it('sends the version it read so a stale edit can be refused', async () => {
    const task = makeTask({ id: 't1', title: 'Köhnə ad', updatedAtUtc: '2026-09-08T06:00:00Z' });
    mockApi({ tasks: { t1: makeDetail(task) } });
    const view = await renderForm({ id: 't1' });

    await waitFor(() => expect(view.getByTestId('task-title').props.value).toBe('Köhnə ad'));
    await fireEvent.changeText(view.getByTestId('task-title'), 'Yeni ad');
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'PUT')!.body).toMatchObject({ title: 'Yeni ad', expectedUpdatedAtUtc: '2026-09-08T06:00:00Z' });
  });

  it('explains a refused stale edit instead of pretending it saved', async () => {
    const task = makeTask({ id: 't1', title: 'Köhnə ad' });
    mockApi({ tasks: { t1: makeDetail(task) }, onUpdate: () => jsonResponse({ title: 'Task was changed elsewhere', detail: 'Reload the task and apply the change again.' }, 409) });
    const view = await renderForm({ id: 't1' });

    await waitFor(() => expect(view.getByTestId('task-title').props.value).toBe('Köhnə ad'));
    await fireEvent.changeText(view.getByTestId('task-title'), 'Yeni ad');
    await fireEvent.press(view.getByTestId('task-submit'));

    await waitFor(() => expect(view.getByText(/Reload the task/)).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId('task-title').props.value).toBe('Yeni ad');
  });

  it('says which day of a repeating task is being edited', async () => {
    const task = makeTask({ id: 't2', seriesId: 's1', seriesKind: 'Daily' });
    mockApi({ tasks: { t2: { ...makeDetail(task), series: { id: 's1', title: 'Su iç', note: null, plannedTime: null, priority: 'Normal', kind: 'Daily', weekdays: [], startDate: taskToday, endDate: null, isStopped: false, createdAtUtc: task.createdAtUtc, updatedAtUtc: task.updatedAtUtc } } } });
    const view = await renderForm({ id: 't2' });

    await waitFor(() => expect(view.getByText(/Dəyişiklik yalnız bu günə aiddir/)).toBeTruthy());
    // A single occurrence's form never offers to change the schedule itself.
    expect(view.queryByTestId('task-add-recurrence')).toBeNull();
  });

  it('deletes an existing task after confirmation', async () => {
    const task = makeTask({ id: 't3' });
    mockApi({ tasks: { t3: makeDetail(task) } });
    const view = await renderForm({ id: 't3' });

    await waitFor(() => view.getByTestId('task-delete'));
    await fireEvent.press(view.getByTestId('task-delete'));

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/tasks/t3')).toBe(true));
    expect(mockBack).toHaveBeenCalled();
  });
});
