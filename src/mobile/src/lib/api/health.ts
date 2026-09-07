import { z } from 'zod';

import { env } from '@/lib/env';

const healthStatusSchema = z.enum(['Healthy', 'Degraded', 'Unhealthy']);

export const healthReportSchema = z.object({
  status: healthStatusSchema,
  totalDurationMs: z.number(),
  checks: z.array(
    z.object({
      name: z.string(),
      status: healthStatusSchema,
      durationMs: z.number(),
      description: z.string().nullable().optional(),
    }),
  ),
});

export type HealthReport = z.infer<typeof healthReportSchema>;

/**
 * GET /health/ready. The API answers with the same JSON body for 200 (Healthy) and 503 (Unhealthy),
 * so the body is parsed regardless of status code; transport failures still throw.
 */
export async function fetchApiReadiness(signal?: AbortSignal): Promise<HealthReport> {
  const response = await fetch(`${env.EXPO_PUBLIC_API_URL}/health/ready`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error(`API cavabı gözlənilməz formatdadır (HTTP ${response.status}).`);
  }

  return healthReportSchema.parse(await response.json());
}
