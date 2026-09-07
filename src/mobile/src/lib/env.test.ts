import { parseEnv } from '@/lib/env';

describe('parseEnv', () => {
  it('falls back to the local API when the variable is missing or blank', () => {
    expect(parseEnv({}).EXPO_PUBLIC_API_URL).toBe('http://localhost:5134');
    expect(parseEnv({ EXPO_PUBLIC_API_URL: '   ' }).EXPO_PUBLIC_API_URL).toBe('http://localhost:5134');
  });

  it('strips trailing slashes so paths can be appended safely', () => {
    expect(parseEnv({ EXPO_PUBLIC_API_URL: 'https://api.example.com/' }).EXPO_PUBLIC_API_URL).toBe(
      'https://api.example.com',
    );
  });

  it('rejects values that are not http(s) URLs', () => {
    expect(() => parseEnv({ EXPO_PUBLIC_API_URL: 'not-a-url' })).toThrow();
    expect(() => parseEnv({ EXPO_PUBLIC_API_URL: 'ftp://example.com' })).toThrow();
  });
});
