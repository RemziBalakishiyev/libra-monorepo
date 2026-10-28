import { Ionicons } from '@expo/vector-icons';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NutritionEntry } from '@/lib/api/nutrition';
import { describeEntry, formatGrams, formatKcal, formatQuantity, macroKinds, mealIcon } from '@/lib/nutrition';

type NutritionEntryRowProps = {
  entry: NutritionEntry;
  /** Opens the entry for inspection and editing. */
  onPress: (entry: NutritionEntry) => void;
  /** Opens the overflow menu (edit, copy, delete). */
  onMore: (entry: NutritionEntry) => void;
  /** Local time of the entry, already formatted ("09:30"). */
  time: string;
  showSeparator?: boolean;
};

/** "1 porsiya" for one food, "2 yemək" once the meal holds several — the portion line stays one short phrase. */
export function portionSummary(entry: NutritionEntry): string {
  if (entry.items.length === 1) {
    return formatQuantity(entry.items[0]!.quantityMode, entry.items[0]!.quantity);
  }
  return `${entry.items.length} yemək`;
}

/**
 * One meal in the diary: what was eaten, when, how much of it, and what it contributed. The whole row opens the
 * entry; the trailing control is a separate 48 pt target for edit / copy / delete.
 *
 * The leading tile is the meal's icon, never a photograph: a stored entry exposes no durable image, and a
 * photo-analysis draft's temporary URL is not a thumbnail the diary may keep showing.
 */
export function NutritionEntryRow({ entry, onPress, onMore, time, showSeparator = false }: NutritionEntryRowProps) {
  const { colors } = useTheme();
  const [first, ...rest] = entry.items;
  const title = first?.name ?? 'Yemək';
  // At enlarged text the energy figure needs a line of its own, or it squeezes the name into an ellipsis.
  const stacked = PixelRatio.getFontScale() > 1.2;
  // Spoken in full, but only time and portion are printed: three macro figures made the line truncate.
  const macros = macroKinds.map((macro) => `${macro.label} ${formatGrams(macro.key === 'protein' ? entry.proteinGrams : macro.key === 'carb' ? entry.carbGrams : entry.fatGrams)}`).join(', ');

  return (
    <View style={[styles.wrapper, showSeparator ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${describeEntry(entry.items)}, ${time}, ${portionSummary(entry)}, ${formatKcal(entry.energyKcal)}, ${macros}`}
        accessibilityHint="Yeməyi açır və düzəliş etməyə imkan verir"
        onPress={() => onPress(entry)}
        scaleTo={0.99}
        containerStyle={styles.pressSlot}
        pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
        style={[styles.row, stacked ? styles.rowStacked : null]}
        testID={`nutrition-entry-${entry.id}`}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name={mealIcon(entry.mealType)} size={16} color={colors.textSecondary} />
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
              {title}
            </AppText>
            {rest.length > 0 ? (
              <View style={[styles.countChip, { backgroundColor: colors.surfaceSubtle }]}>
                <AppText variant="caption" color="textSecondary">
                  +{rest.length}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {time} · {portionSummary(entry)}
          </AppText>
          {entry.note ? (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              <Ionicons name="create-outline" size={11} color={colors.textMuted} /> {entry.note}
            </AppText>
          ) : null}
          {stacked ? (
            <AppText variant="bodyStrong" style={styles.tabular} numberOfLines={1}>
              {formatKcal(entry.energyKcal)}
            </AppText>
          ) : null}
        </View>
        {stacked ? null : (
          <AppText variant="bodyStrong" style={styles.tabular} numberOfLines={1}>
            {formatKcal(entry.energyKcal)}
          </AppText>
        )}
      </PressableScale>
      <IconButton
        icon="ellipsis-horizontal"
        accessibilityLabel={`Əməliyyatlar: ${title}`}
        accessibilityHint="Düzəliş, köçürmə və silmə seçimlərini açır"
        size={18}
        onPress={() => onMore(entry)}
        testID={`nutrition-entry-more-${entry.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  pressSlot: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 6,
    paddingVertical: Spacing.sm,
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
  rowStacked: {
    alignItems: 'flex-start',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  flex: {
    flexShrink: 1,
  },
  countChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
