import { Ionicons } from '@expo/vector-icons';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Entrance } from '@/components/entrance';
import { AppText } from '@/components/text';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMotion } from '@/lib/motion';

export type ToastTone = 'success' | 'info' | 'error';

export interface ToastOptions {
  title: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

let externalShow: ((options: ToastOptions) => void) | null = null;

/** Shows a toast from non-React code (mutations, helpers). No-op when the provider is not mounted. */
export function showToast(options: ToastOptions): void {
  externalShow?.(options);
}

export function useToast(): (options: ToastOptions) => void {
  const show = use(ToastContext);
  return show ?? showToast;
}

/**
 * One short confirmation at a time, anchored above the navigation region so it never covers a screen title.
 * Showing the same message while it is already visible only extends its time — no duplicate stacks.
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);
  const current = useRef<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((options: ToastOptions) => {
    const duration = options.durationMs ?? 2400;
    if (timer.current) {
      clearTimeout(timer.current);
    }
    const existing = current.current;
    if (!existing || existing.title !== options.title || (existing.tone ?? 'success') !== (options.tone ?? 'success')) {
      counter.current += 1;
      const next = { ...options, id: counter.current };
      current.current = next;
      setToast(next);
    }
    timer.current = setTimeout(() => {
      current.current = null;
      setToast(null);
    }, duration);
  }, []);

  useEffect(() => {
    externalShow = show;
    return () => {
      externalShow = null;
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [show]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext value={value}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} /> : null}
    </ToastContext>
  );
}

function ToastView({ toast }: { toast: ToastState }) {
  const { colors, shadows, layout } = useTheme();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const tone = toast.tone ?? 'success';
  const accent = tone === 'success' ? colors.incomeText : tone === 'error' ? colors.error : colors.primaryText;
  const icon = tone === 'success' ? 'checkmark-circle' : tone === 'error' ? 'alert-circle' : 'information-circle';
  // Above the tab bar region on phones/tablets; a little above the bottom edge on desktop.
  const bottom = layout === 'wide' ? insets.bottom + Spacing.xxl : Math.max(insets.bottom, Layout.tabBarGutter) + Layout.tabBarHeight + Layout.tabBarGutter + Spacing.md;

  return (
    <View style={[styles.host, { bottom, paddingLeft: layout === 'wide' ? Layout.sidebarWidth + Spacing.lg : Spacing.lg }]}>
      <Entrance from="below" exiting={motion.exitDown()} accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, boxShadow: shadows.raised }]}>
        <Ionicons name={icon} size={20} color={accent} />
        <AppText variant="bodyStrong" style={styles.text} numberOfLines={2}>
          {toast.title}
        </AppText>
      </Entrance>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingRight: Spacing.lg,
    zIndex: 50,
    pointerEvents: 'box-none',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    maxWidth: 420,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  text: {
    flexShrink: 1,
  },
});
