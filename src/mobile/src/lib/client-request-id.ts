import * as Crypto from 'expo-crypto';
import { useCallback, useRef } from 'react';

export function newClientRequestId(): string {
  return Crypto.randomUUID();
}

/**
 * One idempotency key per create form. Retries and double taps reuse the same id, so the API returns the
 * already-created record instead of a duplicate. Call `reset` after a successful create when the form stays open.
 */
export function useClientRequestId(): { current: () => string; reset: () => void } {
  const ref = useRef<string | null>(null);

  const current = useCallback(() => {
    ref.current ??= newClientRequestId();
    return ref.current;
  }, []);

  const reset = useCallback(() => {
    ref.current = null;
  }, []);

  return { current, reset };
}
