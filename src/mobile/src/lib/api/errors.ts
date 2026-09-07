import { ApiError } from '@/lib/api/client';

export type ErrorKind = 'offline' | 'connection' | 'server' | 'validation' | 'auth' | 'notFound' | 'rateLimited' | 'unknown';

/** True only when the platform reports being offline; a failed request alone is not proof. */
export function isKnownOffline(): boolean {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  return nav?.onLine === false;
}

/** Sorts a thrown value into the states the UI distinguishes (offline, connection, server, validation…). */
export function classifyError(error: unknown): ErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 422) {
      return 'validation';
    }
    if (error.status === 401 || error.status === 403) {
      return 'auth';
    }
    if (error.status === 404) {
      return 'notFound';
    }
    if (error.status === 429) {
      return 'rateLimited';
    }
    if (error.status >= 500) {
      return 'server';
    }
    return 'unknown';
  }
  if (error instanceof TypeError) {
    return isKnownOffline() ? 'offline' : 'connection';
  }
  return 'unknown';
}

/** Turns any thrown value into Azerbaijani copy suitable for a form banner. */
export function describeError(error: unknown, context: 'login' | 'register' | 'generic' = 'generic'): string {
  if (error instanceof ApiError) {
    if (error.status === 401 && context === 'login') {
      return 'E-poçt və ya şifrə yanlışdır.';
    }
    if (error.status === 409 && context === 'register') {
      return 'Bu e-poçt artıq qeydiyyatdan keçib.';
    }
    if (error.status === 429) {
      return 'Çox sayda cəhd edildi. Bir az sonra yenidən cəhd edin.';
    }
    if (error.status === 400 && error.errors) {
      return Object.values(error.errors).flat()[0] ?? 'Məlumatlar düzgün deyil.';
    }
    if (error.status === 401) {
      return 'Sessiya bitib. Yenidən daxil olun.';
    }
    if (error.status >= 500) {
      return 'Serverdə xəta baş verdi. Bir az sonra yenidən cəhd edin.';
    }
    return error.detail ?? error.title;
  }
  const kind = classifyError(error);
  if (kind === 'offline') {
    return 'İnternet bağlantısı yoxdur. Bağlantı bərpa olunanda yenidən cəhd edin.';
  }
  if (kind === 'connection') {
    return 'Serverə qoşulmaq mümkün olmadı. Bağlantını yoxlayıb yenidən cəhd edin.';
  }
  return 'Gözlənilməz xəta baş verdi.';
}
