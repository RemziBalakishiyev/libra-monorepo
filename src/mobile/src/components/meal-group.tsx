import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { NutritionEntryRow } from '@/components/nutrition-entry-row';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MealType, NutritionEntry, NutritionMealGroup } from '@/lib/api/nutrition';
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
 * One meal of the day. The heading carries the meal's icon, its name and its real energy total; a populated
 * group lists its entries, and an empty one is a single compact row that adds to this meal — so an empty day is
 * four short rows rather than four empty cards. Adding from here keeps the meal-type preset.
 */
export function MealGroup({ group, timeOf, onAdd, onOpenEntry, onEntryActions }: MealGroupProps) {
  const { colors } = useTheme();
  const label = mealLabel(group.mealType);
  const icon = mealIcon(group.mealType);
  const empty = group.entries.length === 0;

  return (
    <View style={styles.group} testID={`meal-group-${group.mealType}`}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name={icon} size={15} color={colors.primaryText} />
        </View>
        <AppText variant="bodyStrong" accessibilityRole="header" numberOfLines={1} style={styles.flex}>
          {label}
        </AppText>
        {empty ? null : (
          <AppText variant="meta" color="textSecondary" style={styles.tabular} accessibilityLabel={`${label} cəmi ${formatKcal(group.totals.energyKcal)}`}>
            {formatKcal(group.totals.energyKcal)}
          </AppText>
        )}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${label} üçün yemək əlavə et`}
          onPress={() => onAdd(group.mealType)}
          scaleTo={0.92}
          containerStyle={styles.addSlot}
          pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
          style={[styles.add, { backgroundColor: colors.primarySoft }]}
          testID={`meal-add-${group.mealType}`}>
          <Ionicons name="add" size={18} color={colors.primaryText} />
        </PressableScale>
      </View>

      {empty ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${label}: yemək əlavə et`}
          onPress={() => onAdd(group.mealType)}
          scaleTo={0.995}
          containerStyle={styles.full}
          pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
          style={[styles.emptyRow, { borderColor: colors.border }]}
          testID={`meal-empty-${group.mealType}`}>
          <AppText variant="caption" color="textMuted">
            Qeyd yoxdur — əlavə edin
          </AppText>
        </PressableScale>
      ) : (
        <View style={[styles.entries, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget,
  },
  icon: {
    width: 28,
    height: 28,
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
  addSlot: {
    width: MinTouchTarget - 8,
    height: MinTouchTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: {
    width: '100%',
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MinTouchTarget - 4,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  entries: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xs,
  },
});
