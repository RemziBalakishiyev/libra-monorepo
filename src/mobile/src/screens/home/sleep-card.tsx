import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Skeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useSleepSummary } from '@/hooks/use-sleep';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/color';
import { describeDuration, elapsedMinutes, formatDuration, wakeDayLabel } from '@/lib/sleep';

/**
 * The compact Home card. It reports and opens; it never starts or ends a night — that always happens on the
 * sleep screen, under a press whose meaning is unambiguous.
 *
 * A running session shows how long it has been going, computed from its stored start instant at render time.
 * There is no ticking here: the figure is refreshed when Home is, so nothing announces itself on a timer.
 */
export function HomeSleepCard() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const summary = useSleepSummary();

  const tint = colors.moduleSleep;
  const active = summary.data?.active ?? null;
  const latest = summary.data?.latest ?? null;

  const body = (() => {
    if (summary.isPending) {
      return { value: null, caption: null };
    }
    if (active) {
      return { value: formatDuration(elapsedMinutes(active)), caption: 'Yuxu davam edir' };
    }
    if (latest) {
      return { value: formatDuration(latest.durationMinutes ?? 0), caption: `Son yuxu · ${wakeDayLabel(latest)}` };
    }
    return { value: null, caption: 'Hələ qeyd yoxdur' };
  })();

  const spoken = summary.isPending
    ? 'Yuxu məlumatı yüklənir'
    : active
      ? `Yuxu davam edir, ${describeDuration(elapsedMinutes(active))}`
      : latest
        ? `Son yuxu ${wakeDayLabel(latest)}, ${describeDuration(latest.durationMinutes ?? 0)}`
        : 'Yuxu, hələ qeyd yoxdur';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Yuxu ekranını açır"
      onPress={() => router.push('/sleep')}
      scaleTo={0.99}
      containerStyle={styles.full}
      pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="home-sleep-card">
      <View style={[styles.icon, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.22 : 0.12) }]}>
        <Ionicons name={active ? 'moon' : 'moon-outline'} size={18} color={tint} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          Yuxu
        </AppText>
        {summary.isPending ? (
          <Skeleton width={120} height={12} />
        ) : (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {body.caption}
          </AppText>
        )}
      </View>
      {body.value ? (
        <AppText variant="meta" color="textSecondary" style={styles.value} numberOfLines={1} testID="home-sleep-value">
          {body.value}
        </AppText>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  full: {
    width: '100%',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm + 2,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  value: {
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
});
