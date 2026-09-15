import { createSleepFormSchema, instantFor, maxSleepMinutes, sleepFormSchema, toInstant, type SleepForm } from '@/lib/validation/sleep';

/** A valid night: yesterday 23:00 until today 07:00, both in the past relative to the frozen clock below. */
function form(overrides: Partial<SleepForm> = {}): SleepForm {
  return {
    startDate: '2026-09-09',
    startTime: '23:00',
    endDate: '2026-09-10',
    endTime: '07:00',
    open: false,
    quality: '',
    note: '',
    ...overrides,
  };
}

/** Which field each message is attached to, so a failing submit can point at it. */
function issuesOf(values: SleepForm): Record<string, string> {
  const result = sleepFormSchema.safeParse(values);
  if (result.success) {
    return {};
  }
  return Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

describe('sleepFormSchema', () => {
  beforeEach(() => {
    // Noon on the tenth, local: fixed so "in the future" never depends on when the suite runs.
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 10, 12, 0, 0));
  });

  afterEach(() => jest.useRealTimers());

  it('accepts a night that ended before now', () => {
    expect(sleepFormSchema.safeParse(form()).success).toBe(true);
  });

  it('requires the wake-up to be after the start, and says so on the wake field', () => {
    expect(issuesOf(form({ endDate: '2026-09-09', endTime: '22:00' }))).toEqual({ endTime: 'Oyanma vaxtı yuxu başlanğıcından sonra olmalıdır.' });
  });

  it('refuses a zero-length night', () => {
    expect(issuesOf(form({ endDate: '2026-09-09', endTime: '23:00' })).endTime).toBeTruthy();
  });

  it('refuses moments in the future, naming the field that is ahead of the clock', () => {
    expect(issuesOf(form({ endTime: '13:00', endDate: '2026-09-10' })).endTime).toBe('Oyanma vaxtı gələcəkdə ola bilməz.');
    expect(issuesOf(form({ startDate: '2026-09-10', startTime: '13:00', endDate: '2026-09-10', endTime: '14:00' })).startTime).toBe('Yuxu başlanğıcı gələcəkdə ola bilməz.');
  });

  it('refuses a completed night longer than the documented limit', () => {
    // The limit is the server's own: 24 hours for a closed interval.
    expect(maxSleepMinutes).toBe(24 * 60);
    expect(issuesOf(form({ startDate: '2026-09-08', startTime: '11:00', endDate: '2026-09-09', endTime: '12:00' })).endTime).toBe('Bir yuxu ən çox 24 saat ola bilər.');
    // Exactly 24 hours is still allowed.
    expect(issuesOf(form({ startDate: '2026-09-09', startTime: '11:00', endDate: '2026-09-10', endTime: '11:00' }))).toEqual({});
  });

  it('does not apply the completed-night limit to one that is still running', () => {
    // A forgotten session may be days long; correcting its start must not be blocked by the closed-interval rule.
    expect(sleepFormSchema.safeParse(form({ open: true, startDate: '2026-09-07', startTime: '23:00' })).success).toBe(true);
  });

  it('still refuses a future start on a running night', () => {
    expect(issuesOf(form({ open: true, startDate: '2026-09-10', startTime: '13:00' })).startTime).toBeTruthy();
  });

  it('treats the rating as optional and bounds the note', () => {
    expect(sleepFormSchema.safeParse(form({ quality: '' })).success).toBe(true);
    expect(sleepFormSchema.safeParse(form({ quality: '5' })).success).toBe(true);
    expect(issuesOf(form({ note: 'a'.repeat(501) })).note).toBe('Qeyd çox uzundur.');
  });
});

describe('toInstant', () => {
  it('reads a local date and time as the moment on this device', () => {
    expect(toInstant('2026-09-09', '23:40').getTime()).toBe(new Date(2026, 8, 9, 23, 40, 0, 0).getTime());
  });
});

describe('instantFor', () => {
  it('keeps the stored instant when the edited fields still name the same minute', () => {
    const stored = new Date(2026, 8, 10, 6, 41, 37, 0).toISOString();

    // Adding a rating must not quietly move a wake-up recorded at 06:41:37 back to 06:41:00.
    expect(instantFor('2026-09-10', '06:41', stored)).toBe(stored);
  });

  it('sends the edited moment once the minute actually changes', () => {
    const stored = new Date(2026, 8, 10, 6, 41, 37, 0).toISOString();

    expect(instantFor('2026-09-10', '06:45', stored)).toBe(new Date(2026, 8, 10, 6, 45).toISOString());
  });

  it('falls back to the edited moment when nothing is stored', () => {
    expect(instantFor('2026-09-10', '06:45', null)).toBe(new Date(2026, 8, 10, 6, 45).toISOString());
  });
});

describe('createSleepFormSchema', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 10, 12, 0, 0));
  });

  afterEach(() => jest.useRealTimers());

  it('accepts a correction to a night that began and ended inside one minute', () => {
    // The form only shows minutes, so both fields read 09:15 — but the stored night really is ordered, and
    // rating it must not fail a comparison the user has no way to satisfy.
    const stored = { startedAtUtc: new Date(2026, 8, 10, 9, 15, 3).toISOString(), endedAtUtc: new Date(2026, 8, 10, 9, 15, 48).toISOString() };
    const values = form({ startDate: '2026-09-10', startTime: '09:15', endDate: '2026-09-10', endTime: '09:15', quality: '4' });

    expect(createSleepFormSchema(stored).safeParse(values).success).toBe(true);
    // Without that stored interval the same minutes are exactly what they look like: a zero-length night.
    expect(sleepFormSchema.safeParse(values).success).toBe(false);
  });

  it('still refuses an edit that really does invert the interval', () => {
    const stored = { startedAtUtc: new Date(2026, 8, 10, 9, 15, 3).toISOString(), endedAtUtc: new Date(2026, 8, 10, 9, 15, 48).toISOString() };
    const values = form({ startDate: '2026-09-10', startTime: '09:15', endDate: '2026-09-10', endTime: '09:10' });

    expect(createSleepFormSchema(stored).safeParse(values).success).toBe(false);
  });
});
