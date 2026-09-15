import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { NutritionEntryRow } from '@/components/nutrition-entry-row';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MealType, NutritionEntry, NutritionMealGroup } from '@/lib/api/nutrition';
import { withAlpha } from '@/lib/color';
import { formatKcal, mealIcon, mealLabel } from '@/lib/nutrition';

type MealGroupProps = {
  group: NutritionMealGroup;
  /** Local time formatter for the entries (the diary owns the profile time zone). */
  timeOf: (entry: NutritionEntry) => string;
  onAdd: (mealType: MealType) => void;
  onOpenEntry: (entry: NutritionEntry) => void;
  onEntryActions: (entry: NutritionEntry) => void;
};

/**
 * One meal of the day. A populated group shows its energy total and its entries; an empty one keeps a single
 * compact "add" row so the diary stays scannable instead of turning into four empty cards.
 */
export function MealGroup({ group, timeOf, onAdd, onOpenEntry, onEntryActions }: MealGroupProps) {
  const { colors, scheme } = useTheme();
  const label = mealLabel(group.mealType);
  const icon = mealIcon(group.mealType);
  const tint = colors.moduleNutrition;
  const empty = group.entries.length === 0;

  return (
    <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`meal-group-${group.mealType}`}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.22 : 0.12) }]}>
          <Ionicons name={icon} size={16} color={tint} />
        </View>
        <AppText variant="subheading" accessibilityRole="header" numberOfLines={1} style={styles.flex}>
          {label}
        </AppText>
        {empty ? null : (
          <AppText variant="bodyStrong" style={styles.tabular} accessibilityLabel={`${label} cəmi ${formatKcal(group.totals.energyKcal)}`}>
            {formatKcal(group.totals.energyKcal)}
          </AppText>
        )}
        <IconButton icon="add" accessibilityLabel={`${label} üçün yemək əlavə et`} size={20} variant="filled" onPress={() => onAdd(group.mealType)} testID={`meal-add-${group.mealType}`} />
      </View>

      {empty ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${label}: yemək əlavə et`}
          onPress={() => onAdd(group.mealType)}
          scaleTo={0.99}
          containerStyle={styles.full}
          pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
          style={styles.emptyRow}>
          <Ionicons name="add-circle-outline" size={18} color={colors.textMuted} />
          <AppText variant="meta" color="textSecondary">
            Hələ yemək yoxdur — əlavə edin
          </AppText>
        </PressableScale>
      ) : (
        <View style={styles.entries}>
          {group.entries.map((entry, index) => (
            <NutritionEntryRow key={entry.id} entry={entry} time={timeOf(entry)} onPress={onOpenEntry} onMore={onEntryActions} showSeparator={index > 0} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget + 4,
    paddingLeft: Spacing.sm,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  full: {
    width: '100%',
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  entries: {
    paddingTop: Spacing.xxs,
  },
});
