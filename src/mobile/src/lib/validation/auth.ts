import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'E-poçt daxil edin.')
  .max(320, 'E-poçt çox uzundur.')
  .email('E-poçt düzgün deyil.');

export const passwordSchema = z
  .string()
  .min(8, 'Şifrə ən azı 8 simvol olmalıdır.')
  .max(128, 'Şifrə çox uzundur.');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Şifrə daxil edin.'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(100, 'Ad çox uzundur.'),
});

export const profileSchema = z.object({
  displayName: z.string().trim().max(100, 'Ad çox uzundur.'),
  timeZone: z.string().trim().min(1, 'Saat qurşağı daxil edin.').max(64),
  locale: z.string().trim().min(1, 'Dil daxil edin.').max(16),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Valyuta 3 hərfli ISO kodu olmalıdır (məs. AZN).'),
});

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
export type ProfileForm = z.infer<typeof profileSchema>;
