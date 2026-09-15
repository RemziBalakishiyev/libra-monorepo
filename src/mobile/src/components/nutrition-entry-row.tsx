import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NutritionEntry } from '@/lib/api/nutrition';
import { formatGrams, formatKcal, formatQuantity } from '@/lib/nutrition';

type NutritionEntryRowProps = {
  entry: NutritionEntry;
  /** Opens the entry for inspection and editing. */
  onPress: (entry: NutritionEntry) => void;
  /** Opens the overflow menu (copy, delete). */
  onMore: (entry: NutritionEntry) => void;
  /** Local time of the entry, already formatted ("09:30"). */
  time: string;
  showSeparator?: boolean;
};

/**
 * One meal in the diary: what was eaten, how much of it, and what it contributed. The whole row opens the
 * entry; the trailing control is a separate 48 pt target for the copy/delete actions.
 */
export function NutritionEntryRow({ entry, onPress, onMore, time, showSeparator = false }: NutritionEntryRowProps) {
  const { colors } = useTheme();
  const [first, ...rest] = entry.items;
  const quantities = entry.items.map((item) => formatQuantity(item.quantityMode, item.quantity)).join(' · ');
  const macros = `Z ${formatGrams(entry.proteinGrams, false)} · K ${formatGrams(entry.carbGrams, false)} · Y ${formatGrams(entry.fatGrams, false)}`;

  return (
    <View style={[styles.wrapper, showSeparator ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${first?.name ?? 'Yemək'}${rest.length > 0 ? ` və daha ${rest.length}` : ''}, ${time}, ${formatKcal(entry.energyKcal)}`}
        accessibilityHint="Yeməyi açır və düzəliş etməyə imkan verir"
        onPress={() => onPress(entry)}
        scaleTo={0.99}
        containerStyle={styles.pressSlot}
        pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
        style={styles.row}
        testID={`nutrition-entry-${entry.id}`}>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
              {first?.name ?? 'Yemək'}
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
            {time} · {quantities}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {macros}
          </AppText>
          {entry.note ? (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              <Ionicons name="create-outline" size={11} color={colors.textMuted} /> {entry.note}
            </AppText>
          ) : null}
        </View>
        <AppText variant="bodyStrong" style={styles.tabular} numberOfLines={1}>
          {formatKcal(entry.energyKcal)}
        </AppText>
      </PressableScale>
      <IconButton
        icon="ellipsis-horizontal"
        accessibilityLabel={`Əməliyyatlar: ${first?.name ?? 'yemək'}`}
        accessibilityHint="Köçürmə və silmə seçimlərini açır"
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
    gap: Spacing.xs,
  },
  pressSlot: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
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
