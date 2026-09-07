import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { classifyError, describeError, type ErrorKind } from '@/lib/api/errors';

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Loading bone with a gentle opacity pulse; reduced motion shows it static. */
export function Skeleton({ width = '100%', height = 16, radius = Radius.sm, style }: SkeletonProps) {
  const { colors, reducedMotion } = useTheme();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      pulse.set(1);
      return;
    }
    pulse.set(withRepeat(withTiming(0.55, { duration: 700 }), -1, true));
  }, [reducedMotion, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width, height, borderRadius: radius, backgroundColor: colors.skeleton }, animated, style]} />;
}

/** Skeleton shaped like a list of rows (icon, two lines, amount). */
export function ListSkeleton({ rows = 5, label = 'Yüklənir…' }: { rows?: number; label?: string }) {
  return (
    <View style={styles.stack} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.rowSkeleton}>
          <Skeleton width={40} height={40} radius={Radius.md} />
          <View style={styles.rowSkeletonText}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={64} height={16} />
        </View>
      ))}
    </View>
  );
}

/** Skeleton shaped like a form (label + field pairs) and a footer button. */
export function FormSkeleton({ fields = 4, label = 'Yüklənir…' }: { fields?: number; label?: string }) {
  return (
    <View style={styles.stack} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      {Array.from({ length: fields }, (_, index) => (
        <View key={index} style={styles.fieldSkeleton}>
          <Skeleton width={90} height={12} />
          <Skeleton height={48} radius={Radius.md} />
        </View>
      ))}
    </View>
  );
}

/** Inline loading row for small contexts. */
export function LoadingState({ label = 'Yüklənir…' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.inline} accessibilityLiveRegion="polite">
      <ActivityIndicator accessibilityLabel={label} color={colors.primary} />
      <AppText color="textSecondary">{label}</AppText>
    </View>
  );
}

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
  /** Module accent for the illustration. */
  accent?: string;
  compact?: boolean;
};

/** Explains the next useful action with a small code-native illustration (concentric rings + icon). */
export function EmptyState({ icon = 'wallet-outline', title, message, actionTitle, onAction, accent, compact = false }: EmptyStateProps) {
  const { colors } = useTheme();
  const tint = accent ?? colors.primary;
  return (
    <View style={[styles.center, compact ? styles.centerCompact : null]}>
      <View style={[styles.illustration, compact ? styles.illustrationCompact : null]}>
        <View style={[styles.ringOuter, { borderColor: colors.border }]} />
        <View style={[styles.ringInner, { backgroundColor: colors.surfaceSubtle }]} />
        <View style={[styles.iconTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name={icon} size={26} color={tint} />
        </View>
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText color="textSecondary" align="center" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {actionTitle && onAction ? <Button title={actionTitle} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

const errorHeadings: Record<ErrorKind, { title: string; icon: IconName }> = {
  offline: { title: 'İnternet bağlantısı yoxdur', icon: 'cloud-offline-outline' },
  connection: { title: 'Serverə qoşulmaq mümkün olmadı', icon: 'cloud-offline-outline' },
  server: { title: 'Serverdə xəta baş verdi', icon: 'server-outline' },
  validation: { title: 'Sorğu qəbul edilmədi', icon: 'alert-circle-outline' },
  auth: { title: 'Sessiya bitib', icon: 'lock-closed-outline' },
  notFound: { title: 'Məlumat tapılmadı', icon: 'search-outline' },
  rateLimited: { title: 'Çox sayda cəhd', icon: 'time-outline' },
  unknown: { title: 'Məlumat yüklənmədi', icon: 'alert-circle-outline' },
};

type ErrorStateProps = {
  error: unknown;
  onRetry: () => void;
  title?: string;
  compact?: boolean;
};

/**
 * Plain-language failure with retry. "No internet" is claimed only when the platform reports being offline;
 * otherwise a failed connection, a server error and a rejected request each get their own wording.
 */
export function ErrorState({ error, onRetry, title, compact = false }: ErrorStateProps) {
  const { colors } = useTheme();
  const kind = classifyError(error);
  const heading = errorHeadings[kind];
  return (
    <View style={[styles.center, compact ? styles.centerCompact : null]} accessibilityRole="alert">
      <View style={[styles.iconTile, { backgroundColor: colors.errorSoft, borderColor: colors.errorSoft }]}>
        <Ionicons name={heading.icon} size={26} color={colors.error} />
      </View>
      <AppText variant="heading" align="center">
        {title ?? heading.title}
      </AppText>
      <AppText color="textSecondary" align="center" style={styles.message}>
        {describeError(error)}
      </AppText>
      <Button title="Yenidən cəhd et" variant="secondary" icon="refresh" onPress={onRetry} style={styles.action} />
    </View>
  );
}

/** Small inline error for a section inside a screen that still works otherwise. */
export function InlineError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.inlineError, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={colors.error} />
      <AppText variant="meta" color="error" style={styles.flex}>
        {describeError(error)}
      </AppText>
      <Button title="Yenidən" variant="ghost" size="sm" onPress={onRetry} />
    </View>
  );
}

/** Shown above cached content when a refresh failed: the data on screen is real but may be stale. */
export function StaleNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { colors } = useTheme();
  const kind = classifyError(error);
  const reason = kind === 'offline' ? 'internet yoxdur' : kind === 'connection' ? 'serverə qoşulmaq mümkün olmadı' : 'yeniləmək mümkün olmadı';
  return (
    <View style={[styles.stale, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="time-outline" size={16} color={colors.warningText} />
      <AppText variant="caption" color="warningText" style={styles.flex}>
        Göstərilən məlumat köhnə ola bilər: {reason}.
      </AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Yenidən yüklə" onPress={onRetry} hitSlop={8} style={styles.staleAction}>
        <AppText variant="caption" color="warningText">
          Yenilə
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stack: {
    gap: Spacing.lg,
  },
  rowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowSkeletonText: {
    flex: 1,
    gap: Spacing.sm,
  },
  fieldSkeleton: {
    gap: Spacing.sm,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  centerCompact: {
    paddingVertical: Spacing.xl,
  },
  illustration: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  illustrationCompact: {
    width: 88,
    height: 88,
  },
  ringOuter: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 56,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ringInner: {
    position: 'absolute',
    width: '75%',
    height: '75%',
    borderRadius: 42,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    maxWidth: 360,
  },
  action: {
    marginTop: Spacing.sm,
    minWidth: 200,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  staleAction: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
});
