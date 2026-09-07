import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { registerConfirmHandler, type ConfirmRequest } from '@/lib/confirm';

interface PendingConfirm extends ConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

/**
 * In-app confirmation dialog for destructive actions on every platform. `confirmAsync` from `lib/confirm`
 * resolves through this provider; the dialog keeps focus inside itself on web and returns it afterwards.
 */
export function ConfirmProvider({ children }: PropsWithChildren) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  useEffect(() => {
    return registerConfirmHandler(
      (request) =>
        new Promise<boolean>((resolve) => {
          pendingRef.current?.resolve(false);
          const next = { ...request, resolve };
          pendingRef.current = next;
          setPending(next);
        }),
    );
  }, []);

  return (
    <>
      {children}
      <Sheet visible={pending !== null} onClose={() => settle(false)} presentation="dialog" title={pending?.title} accessibilityLabel={pending?.title} maxWidth={420} scrollable={false}>
        {pending ? (
          <View style={styles.content}>
            <AppText color="textSecondary">{pending.message}</AppText>
            <View style={styles.actions}>
              <Button title="Ləğv et" variant="secondary" onPress={() => settle(false)} style={styles.action} />
              <Button title={pending.confirmLabel} variant={pending.destructive ? 'danger' : 'primary'} onPress={() => settle(true)} style={styles.action} testID="confirm-accept" />
            </View>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
  },
});
