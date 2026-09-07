import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated from 'react-native-reanimated';

import { Entrance } from '@/components/entrance';
import { PressableScale } from '@/components/pressable-scale';
import { Sheet } from '@/components/sheet';
import { AppText, MoneyText, formatAmount, spokenMoney } from '@/components/text';
import { categoryColor, categoryVisual } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Transaction } from '@/lib/api/finance';
import { withAlpha } from '@/lib/color';
import { formatRelativeDay } from '@/lib/dates';
import { useMotion } from '@/lib/motion';

export type TransactionRowItem = Pick<Transaction, 'id' | 'accountName' | 'currencyCode' | 'categoryName' | 'type' | 'amount' | 'occurredAtUtc' | 'note'>;

/** "Market · 24,50 AZN · Nağd" — identifies a transaction in confirmations. */
export function describeTransaction(transaction: TransactionRowItem): string {
  return `${transaction.categoryName} · ${formatAmount(transaction.amount, transaction.currencyCode)} · ${transaction.accountName}`;
}

/** Second line of a row: the note when it adds information, then account and day. */
export function transactionMeta(transaction: TransactionRowItem, now = new Date()): string {
  const note = transaction.note?.trim();
  const parts: string[] = [];
  if (note && note.toLocaleLowerCase('az') !== transaction.categoryName.toLocaleLowerCase('az')) {
    parts.push(note);
  }
  parts.push(transaction.accountName, formatRelativeDay(transaction.occurredAtUtc, now));
  return parts.join(' · ');
}

type TransactionRowProps = {
  transaction: TransactionRowItem;
  onPress?: () => void;
  /** Enables swipe-to-delete on native and an overflow menu on web. Deletion is confirmed by the caller. */
  onDelete?: () => void;
  isLast?: boolean;
  /** Renders inside a white surface (list screens) or directly on the canvas (dashboard). */
  onSurface?: boolean;
};

/** One transaction. Type is readable from the sign and the icon, not only from colour. */
export function TransactionRow({ transaction, onPress, onDelete, isLast = false, onSurface = false }: TransactionRowProps) {
  const { colors, scheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const visual = categoryVisual(transaction.categoryName, transaction.type);
  const tint = categoryColor(transaction.categoryName, scheme, transaction.type);
  const meta = transactionMeta(transaction);
  const label = `${spokenMoney(transaction.amount, transaction.currencyCode, transaction.type)}, ${transaction.categoryName}, ${meta}`;

  const row = (
    <View style={[styles.outer, { backgroundColor: onSurface ? colors.surface : colors.canvas }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={onPress ? 'Əməliyyatı açır' : undefined}
        onPress={onPress}
        disabled={!onPress}
        scaleTo={0.99}
        containerStyle={styles.flex}
        pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
        style={[styles.row, { borderBottomColor: colors.border }, isLast ? styles.last : null]}>
        <View style={[styles.icon, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.18 : 0.12) }]}>
          <Ionicons name={visual.icon} size={18} color={tint} />
        </View>
        <View style={styles.text}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {transaction.categoryName}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {meta}
          </AppText>
        </View>
        <View style={styles.amount}>
          <MoneyText amount={transaction.amount} currencyCode={transaction.currencyCode} flow={transaction.type} variant="bodyStrong" showCode={false} numberOfLines={1} />
        </View>
      </PressableScale>
      {onDelete && Platform.OS === 'web' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${describeTransaction(transaction)}: əlavə əməliyyatlar`} onPress={() => setMenuOpen(true)} hitSlop={6} style={({ pressed }) => [styles.more, { backgroundColor: pressed ? colors.surfaceSubtle : 'transparent' }]}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {onDelete && Platform.OS === 'web' ? (
        <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={describeTransaction(transaction)} presentation="dialog" maxWidth={360} scrollable={false}>
          <MenuItem
            icon="open-outline"
            label="Aç"
            onPress={() => {
              setMenuOpen(false);
              onPress?.();
            }}
          />
          <MenuItem
            icon="trash-outline"
            label="Sil"
            destructive
            onPress={() => {
              setMenuOpen(false);
              onDelete();
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );

  if (onDelete && Platform.OS !== 'web') {
    return (
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={56}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${describeTransaction(transaction)} əməliyyatını sil`} onPress={onDelete} style={[styles.swipeAction, { backgroundColor: colors.expense }]}>
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <AppText variant="caption" style={{ color: '#FFFFFF' }}>
              Sil
            </AppText>
          </Pressable>
        )}>
        {row}
      </ReanimatedSwipeable>
    );
  }
  return row;
}

function MenuItem({ icon, label, onPress, destructive = false }: { icon: 'open-outline' | 'trash-outline'; label: string; onPress: () => void; destructive?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSubtle : 'transparent' }]}>
      <Ionicons name={icon} size={20} color={destructive ? colors.expenseText : colors.textSecondary} />
      <AppText variant="bodyStrong" color={destructive ? 'expenseText' : 'textPrimary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

type TransactionListProps = {
  transactions: TransactionRowItem[];
  onPress?: (transaction: TransactionRowItem) => void;
  onDelete?: (transaction: TransactionRowItem) => void;
  onSurface?: boolean;
  /** Animate entrances only for ids not in this set (rows that arrived after mount). */
  animateNew?: boolean;
  empty?: ReactNode;
};

/**
 * Non-virtualised list for short lists (dashboard, small pages). New rows enter with a rise and the rest reflow
 * through a layout transition; rows already present at mount render immediately.
 */
export function TransactionList({ transactions, onPress, onDelete, onSurface = false, animateNew = true, empty }: TransactionListProps) {
  const motion = useMotion();
  const [initialIds] = useState(() => new Set(transactions.map((transaction) => transaction.id)));

  if (transactions.length === 0) {
    return <>{empty ?? null}</>;
  }

  return (
    <View>
      {transactions.map((transaction, index) => (
        <Animated.View key={transaction.id} exiting={motion.exitUp()} layout={motion.layout()}>
          <Entrance disabled={!animateNew || initialIds.has(transaction.id)}>
            <TransactionRow
              transaction={transaction}
              onSurface={onSurface}
              isLast={index === transactions.length - 1}
              onPress={onPress ? () => onPress(transaction) : undefined}
              onDelete={onDelete ? () => onDelete(transaction) : undefined}
            />
          </Entrance>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  outer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 10,
    paddingVertical: Spacing.sm + 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last: {
    borderBottomWidth: 0,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  amount: {
    flexShrink: 0,
    alignItems: 'flex-end',
    paddingLeft: Spacing.xs,
  },
  more: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.xxs,
  },
  swipeAction: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xxs,
    borderRadius: Radius.md,
    marginVertical: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
});
