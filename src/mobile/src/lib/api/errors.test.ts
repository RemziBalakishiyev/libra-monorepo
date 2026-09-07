import { ApiError } from '@/lib/api/client';
import { classifyError, describeError } from '@/lib/api/errors';

describe('describeError', () => {
  it('maps auth-specific statuses in context', () => {
    expect(describeError(new ApiError(401, 'Invalid credentials'), 'login')).toBe('E-poçt və ya şifrə yanlışdır.');
    expect(describeError(new ApiError(409, 'Email is already registered'), 'register')).toBe('Bu e-poçt artıq qeydiyyatdan keçib.');
  });

  it('maps rate limiting, validation, session loss, and conflicts from Problem Details', () => {
    expect(describeError(new ApiError(429, 'Too many requests'))).toBe('Çox sayda cəhd edildi. Bir az sonra yenidən cəhd edin.');
    expect(describeError(new ApiError(400, 'Validation', undefined, { Amount: ["'Amount' must be greater than zero."] }))).toBe(
      "'Amount' must be greater than zero.",
    );
    expect(describeError(new ApiError(401, 'Unauthorized'))).toBe('Sessiya bitib. Yenidən daxil olun.');
    expect(describeError(new ApiError(409, 'Account currency cannot change after activity exists'))).toBe(
      'Account currency cannot change after activity exists',
    );
    expect(describeError(new ApiError(404, 'Account not found', 'The account does not exist.'))).toBe('The account does not exist.');
  });

  it('distinguishes a failed connection from a known offline state and from unknown errors', () => {
    const nav = globalThis as { navigator?: { onLine?: boolean } };
    const original = nav.navigator;
    nav.navigator = { onLine: true };
    expect(classifyError(new TypeError('Network request failed'))).toBe('connection');
    expect(describeError(new TypeError('Network request failed'))).toBe('Serverə qoşulmaq mümkün olmadı. Bağlantını yoxlayıb yenidən cəhd edin.');
    nav.navigator = { onLine: false };
    expect(classifyError(new TypeError('Network request failed'))).toBe('offline');
    expect(describeError(new TypeError('Network request failed'))).toBe('İnternet bağlantısı yoxdur. Bağlantı bərpa olunanda yenidən cəhd edin.');
    nav.navigator = original;
    expect(classifyError(new ApiError(500, 'Server error'))).toBe('server');
    expect(describeError(new ApiError(503, 'Unavailable'))).toBe('Serverdə xəta baş verdi. Bir az sonra yenidən cəhd edin.');
    expect(classifyError(new ApiError(400, 'Bad request'))).toBe('validation');
    expect(describeError('boom')).toBe('Gözlənilməz xəta baş verdi.');
  });
});
