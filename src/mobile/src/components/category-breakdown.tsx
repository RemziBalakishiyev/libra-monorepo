import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ProgressTrack } from '@/components/budget-progress';
import { AppText, MoneyText } from '@/components/text';
import { categoryColor, categoryVisual } from '@/constants/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CategoryBreakdownProps = {
  items: { categoryId: string; categoryName: string; amount: number; percent: number }[];
  currencyCode: string;
  limit?: number;
  animateOnMount?: boolean;
};

/** Share of this month's expenses per category. Colour follows the category name, never its rank. */
export function CategoryBreakdown({ items, currencyCode, limit = 5, animateOnMount = false }: CategoryBreakdownProps) {
  const { scheme } = useTheme();
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const restAmount = rest.reduce((sum, item) => sum + item.amount, 0);

  if (items.length === 0) {
    return (
      <AppText color="textSecondary" style={styles.empty}>
        Bu ay xərc yoxdur.
      </AppText>
    );
  }

  return (
    <View style={styles.list}>
      {shown.map((item) => {
        const visual = categoryVisual(item.categoryName);
        const color = categoryColor(item.categoryName, scheme);
        return (
          <View key={item.categoryId} style={styles.item} accessible accessibilityLabel={`${item.categoryName}: ${item.amount} ${currencyCode}, ${Math.round(item.percent)}%`}>
            <View style={styles.itemHeader}>
              <View style={styles.itemTitle}>
                <Ionicons name={visual.icon} size={16} color={color} />
                <AppText variant="meta" numberOfLines={1} style={styles.flex}>
                  {item.categoryName}
                </AppText>
              </View>
              <View style={styles.itemFigures}>
                <MoneyText variant="meta" amount={item.amount} currencyCode={currencyCode} showCode={false} />
                <AppText variant="caption" color="textMuted">
                  {' '}
                  {Math.round(item.percent)}%
                </AppText>
              </View>
            </View>
            <ProgressTrack percent={item.percent} color={color} label={`${item.categoryName} payı`} height={6} animateOnMount={animateOnMount} />
          </View>
        );
      })}
      {rest.length > 0 ? (
        <View style={styles.itemHeader}>
          <AppText variant="caption" color="textMuted">
            Digər {rest.length} kateqoriya
          </AppText>
          <MoneyText variant="caption" color="textMuted" amount={restAmount} currencyCode={currencyCode} showCode={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  empty: {
    paddingVertical: Spacing.sm,
  },
  list: {
    gap: Spacing.md,
  },
  item: {
    gap: Spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  itemTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  itemFigures: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});
