import { z } from 'zod';

/**
 * Public, build-time configuration. Only EXPO_PUBLIC_* variables are inlined by Expo,
 * so nothing secret may ever be placed here.
 */
export const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:5134')
    .transform((url) => url.replace(/\/+$/, '')),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return envSchema.parse({
    EXPO_PUBLIC_API_URL: emptyToUndefined(raw.EXPO_PUBLIC_API_URL),
  });
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

export const env: Env = parseEnv({
  // Must be referenced literally so Expo can inline it at build time.
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});
