import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCountdown, formatDuration, remainingSeconds, type FocusState } from '@/lib/focus/machine';

type FocusCardProps = {
  state: FocusState | null;
  /** Today's recorded focus, from the server summary. Null while it has not loaded. */
  todaySeconds: number | null;
  /** The instant the timer store last read, so the card and the Focus screen show the same second. */
  nowMs: number;
  onOpen: () => void;
  onStart: () => void;
};

const phaseWords: Record<string, string> = {
  focus: 'Fokus',
  shortBreak: 'Qısa fasilə',
  longBreak: 'Uzun fasilə',
};

/**
 * The Fokus entry in Plan: one compact row, never a timer dashboard above the task list.
 *
 * Idle it offers the configured length and a start. Running or paused it shows what is left, the task it is
 * attached to, and a way back into the screen. The countdown here is drawn from the same instants the Focus
 * screen uses, so the two can never disagree.
 */
export function FocusCard({ state, todaySeconds, nowMs, onOpen, onStart }: FocusCardProps) {
  const { colors } = useTheme();
  const status = state?.status ?? 'ready';
  const active = status === 'running' || status === 'paused';
  const left = state && active ? remainingSeconds(state, nowMs) : null;
  const phase = phaseWords[state?.phase ?? 'focus'] ?? 'Fokus';

  const headline = active ? formatCountdown(left ?? 0) : formatDuration(state?.durationSeconds ?? 25 * 60);
  const detail = active
    ? `${phase}${status === 'paused' ? ' · Pauzada' : ''}${state?.link ? ` · ${state.link.title}` : ''}`
    : todaySeconds && todaySeconds > 0
      ? `Bu gün ${formatDuration(todaySeconds)} fokus`
      : 'Bir mərhələ seçib başlayın';

  return (
    // The row and its action are siblings, never one control inside another: nesting them would make an
    // invalid button on the web and give a screen reader two overlapping targets.
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: active ? colors.primaryText : colors.border }]} testID="focus-card">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={active ? `Fokus, ${formatDuration(left ?? 0)} qalıb${status === 'paused' ? ', pauzada' : ''}` : 'Fokus'}
        accessibilityHint="Fokus ekranını açır"
        onPress={onOpen}
        scaleTo={0.995}
        containerStyle={styles.pressSlot}
        pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
        style={styles.body}
        testID="focus-card-open">
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={status === 'paused' ? 'pause' : active ? 'timer' : 'timer-outline'} size={18} color={colors.primaryText} />
        </View>

        <View style={styles.text}>
          <View style={styles.headline}>
            <AppText variant="bodyStrong" style={active ? styles.tabular : undefined} testID="focus-card-headline">
              {headline}
            </AppText>
            {active ? (
              <AppText variant="caption" color="textSecondary">
                qalıb
              </AppText>
            ) : null}
          </View>
          <AppText variant="caption" color="textSecondary" numberOfLines={1} testID="focus-card-detail">
            {detail}
          </AppText>
        </View>
      </PressableScale>

      {active ? (
        <Button title="Aç" variant="soft" size="sm" onPress={onOpen} testID="focus-card-resume" />
      ) : (
        <Button title="Başla" variant="soft" size="sm" icon="play" onPress={onStart} testID="focus-card-start" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget + 12,
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
    paddingLeft: Spacing.sm,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressSlot: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  icon: {
    width: 34,
    height: 34,
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
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
