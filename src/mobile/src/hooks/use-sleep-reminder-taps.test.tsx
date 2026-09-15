import { renderHook, waitFor } from '@testing-library/react-native';

import { useSleepReminderTaps } from '@/hooks/use-sleep-reminder-taps';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

let mockProfileId: string | undefined = 'user-1';
jest.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ data: mockProfileId ? { id: mockProfileId } : undefined }),
}));

jest.mock('@/lib/sleep-reminder', () => ({
  remindersSupported: true,
  configureReminderPresentation: jest.fn(),
}));

const mockLastResponse = jest.fn();
const mockListeners: ((response: unknown) => void)[] = [];
jest.mock('@/lib/notifications', () => ({
  getLastNotificationResponseAsync: () => mockLastResponse(),
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    mockListeners.push(listener);
    return { remove: () => mockListeners.splice(mockListeners.indexOf(listener), 1) };
  },
}));

/** The shape expo-notifications reports for a tap, trimmed to what the hook reads. */
function tap(data: Record<string, unknown>, identifier = 'notification-1') {
  return { notification: { request: { identifier, content: { data } } } };
}

const ownReminder = tap({ kind: 'sleep-reminder', sessionId: 'sleep-1', userId: 'user-1' });

describe('useSleepReminderTaps', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockListeners.length = 0;
    mockProfileId = 'user-1';
    mockLastResponse.mockReset();
    mockLastResponse.mockResolvedValue(null);
  });

  it('opens the sleep screen for the signed-in user own reminder', async () => {
    mockLastResponse.mockResolvedValue(ownReminder);

    await renderHook(() => useSleepReminderTaps());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/sleep'));
    // Opening the screen is all it does; recording a wake-up stays a deliberate press of "Oyandım".
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('ignores a tap left behind by another account', async () => {
    // The launch response the OS reports is the most recent one and outlives a sign-out. After switching
    // accounts it must not steer the new user, and its session id must never be acted on.
    mockLastResponse.mockResolvedValue(tap({ kind: 'sleep-reminder', sessionId: 'sleep-9', userId: 'user-2' }));

    await renderHook(() => useSleepReminderTaps());

    await waitFor(() => expect(mockLastResponse).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('ignores notifications that are not ours', async () => {
    mockLastResponse.mockResolvedValue(tap({ kind: 'something-else', userId: 'user-1' }));

    await renderHook(() => useSleepReminderTaps());

    await waitFor(() => expect(mockLastResponse).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does nothing until the signed-in account is known', async () => {
    mockProfileId = undefined;
    mockLastResponse.mockResolvedValue(ownReminder);

    await renderHook(() => useSleepReminderTaps());

    expect(mockLastResponse).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates once when the same tap arrives from both the launch response and the listener', async () => {
    mockLastResponse.mockResolvedValue(ownReminder);

    await renderHook(() => useSleepReminderTaps());
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

    mockListeners.forEach((listener) => listener(ownReminder));

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
