import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

export const preferencesSchema = z.object({
  timeZone: z.string(),
  locale: z.string(),
  currency: z.string(),
});

export const profileSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  createdAtUtc: z.string(),
  preferences: preferencesSchema,
});

export type Profile = z.infer<typeof profileSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;

export interface UpdateProfileInput {
  displayName: string | null;
  preferences: Preferences;
}

export function getProfile(signal?: AbortSignal): Promise<Profile> {
  return apiRequest('/api/profile', { auth: true, schema: profileSchema, signal });
}

export function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  return apiRequest('/api/profile', { method: 'PUT', body: input, auth: true, schema: profileSchema });
}
