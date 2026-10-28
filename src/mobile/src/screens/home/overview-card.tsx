import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ProgressTrack } from '@/components/budget-progress';
import { PressableScale } from '@/components/pressable-scale';
import { Skeleton } from '@/components/states';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type OverviewCardProps = {
  title: string;
  icon: IconName;
  /** The primary figure, already formatted. `null` renders "Qeyd yoxdur". */
  value: ReactNode;
  /** Small line under the figure: the unit, the date, or a correctly labelled secondary value. */
  caption?: string | null;
  /** A separately labelled figure (overdue count, other currencies) that must not be mixed into `caption`. */
  aside?: { text: string; tone: 'warning' | 'neutral' } | null;
  /** Whole-percent progress against a real target; omitted when there is nothing to be a fraction of. */
  progress?: { percent: number; label: string } | null;
  /** The relevant action when there is nothing recorded yet. */
  emptyAction?: { title: string; onPress: () => void } | null;
  /** One spoken sentence for the whole card. */
  accessibilityLabel: string;
  onPress: () => void;
  loading?: boolean;
  /** Load failure: the card says so and offers a retry instead of a figure. */
  error?: { onRetry: () => void } | null;
  testID?: string;
};

/**
 * One of the four Home overview cards. Hierarchy comes from typography and the tonal icon tile — every card sits
 * on the same surface, without its own colour or gradient. A missing record reads "Qeyd yoxdur" next to the one
 * useful action; a genuine zero is shown as a number. The card itself opens its module.
 */
export function OverviewCard({ title, icon, value, caption, aside, progress, emptyAction, accessibilityLabel, onPress, loading = false, error, testID }: OverviewCardProps) {
  const { colors, shadows } = useTheme();

  const showAction = !loading && !error && value === null && Boolean(emptyAction);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]} testID={testID}>
      {/* The module link and the empty-state action are siblings, never nested controls. */}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={loading ? `${title}, yüklənir` : error ? `${title}, yüklənmədi` : accessibilityLabel}
        accessibilityHint={`${title} bölməsini açır`}
        onPress={onPress}
        scaleTo={0.98}
        containerStyle={styles.pressSlot}
        pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
        style={[styles.press, showAction ? styles.pressWithAction : null]}
        testID={testID ? `${testID}-open` : undefined}>
        <View style={styles.head}>
          <View style={[styles.tile, { backgroundColor: colors.surfaceSubtle }]}>
            <Ionicons name={icon} size={18} color={colors.primaryText} />
          </View>
          <AppText variant="meta" color="textSecondary" numberOfLines={1} style={styles.title}>
            {title}
          </AppText>
        </View>

        {loading ? (
          <View style={styles.bones}>
            <Skeleton width="70%" height={24} radius={Radius.sm} />
            <Skeleton width="50%" height={12} />
          </View>
        ) : error ? (
          <View style={styles.body}>
            <AppText variant="bodyStrong" color="textSecondary">
              Yüklənmədi
            </AppText>
          </View>
        ) : value === null ? (
          <View style={styles.body}>
            <AppText variant="bodyStrong" color="textSecondary" testID={testID ? `${testID}-empty` : undefined}>
              Qeyd yoxdur
            </AppText>
          </View>
        ) : (
          <View style={styles.body}>
            <View style={styles.valueRow} testID={testID ? `${testID}-value` : undefined}>
              {typeof value === 'string' ? (
                <AppText variant="heading" style={styles.value}>
                  {value}
                </AppText>
              ) : (
                value
              )}
            </View>
            {caption ? (
              <AppText variant="caption" color="textMuted">
                {caption}
              </AppText>
            ) : null}
            {progress ? <ProgressTrack percent={progress.percent} label={progress.label} color={colors.primary} height={6} /> : null}
            {aside ? (
              <View style={[styles.aside, { backgroundColor: aside.tone === 'warning' ? colors.warningSoft : colors.surfaceSubtle }]}>
                <AppText variant="caption" color={aside.tone === 'warning' ? 'warningText' : 'textSecondary'} numberOfLines={2}>
                  {aside.text}
                </AppText>
              </View>
            ) : null}
          </View>
        )}
      </PressableScale>

      {error && !loading ? (
        <View style={styles.actionRow}>
          <Button title="Yenidən cəhd et" variant="ghost" size="sm" icon="refresh-outline" onPress={error.onRetry} />
        </View>
      ) : showAction && emptyAction ? (
        <View style={styles.actionRow}>
          <Button title={emptyAction.title} variant="ghost" size="sm" icon="add" onPress={emptyAction.onPress} testID={testID ? `${testID}-action` : undefined} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 132,
  },
  pressSlot: {
    flex: 1,
  },
  press: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  pressWithAction: {
    paddingBottom: Spacing.xs,
  },
  actionRow: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm + 2,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    gap: Spacing.xs,
    alignItems: 'flex-start',
  },
  bones: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    alignSelf: 'stretch',
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
  aside: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.full,
    marginTop: Spacing.xxs,
  },
});
