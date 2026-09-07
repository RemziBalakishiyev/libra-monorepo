import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { EmptyState, ErrorState, ListSkeleton, LoadingState } from '@/components/states';
import { AppText, MoneyText, formatAmount, spokenMoney } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTransfers } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import type { Transfer } from '@/lib/api/finance';
import { formatRelativeDay } from '@/lib/dates';
import { formatNumber, separatorsFor } from '@/lib/money';

/** "0,5882" — an informational exchange rate with up to four decimals. Not money, so no currency code. */
export function formatRate(rate: number): string {
  const fourDecimals = formatNumber(rate, 4);
  const decimal = separatorsFor().decimal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Trim to at least two decimals: "0,5882" stays, "1,5000" becomes "1,50".
  return fourDecimals.replace(new RegExp(`(${decimal}\\d{2}\\d*?)0+$`), '$1');
}

/** Rows beyond this slot render immediately; the first ones rise in with a short stagger. */
const STAGGERED_ROWS = 8;

/** Every transfer between the user's accounts, newest first, with load-more paging. */
export function TransfersListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const transfers = useTransfers();
  const items = transfers.data?.pages.flatMap((page) => page.items) ?? [];

  const openNew = () => router.push('/finance/transfers/new');

  return (
    <Screen scroll={false}>
      <Entrance index={0}>
        <ScreenHeader
          back
          title="Köçürmələr"
          trailing={<IconButton icon="add" accessibilityLabel="Yeni köçürmə" accessibilityHint="Yeni köçürmə formasını açır" variant="primary" onPress={openNew} testID="transfers-add" />}
        />
      </Entrance>

      <View style={styles.slot}>
        {transfers.isPending ? (
          <Entrance index={1} style={[styles.card, styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ListSkeleton rows={6} label="Köçürmələr yüklənir…" />
          </Entrance>
        ) : null}

        {transfers.isError ? (
          <Entrance index={1}>
            <ErrorState error={transfers.error} onRetry={() => void transfers.refetch()} />
          </Entrance>
        ) : null}

        {transfers.isSuccess && items.length === 0 ? (
          <Entrance index={1}>
            <EmptyState
              icon="swap-horizontal-outline"
              accent={colors.transfer}
              title="Köçürmə yoxdur"
              message="Köçürmə bir hesabdan digərinə pul aparır, ona görə ən azı iki aktiv hesab lazımdır. İlk köçürməni yaradın — hər iki hesabın balansı dərhal yenilənəcək."
              actionTitle="Yeni köçürmə"
              onAction={openNew}
            />
          </Entrance>
        ) : null}

        {transfers.isSuccess && items.length > 0 ? (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            style={[styles.card, styles.list, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: Spacing.xxl + insets.bottom }]}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={transfers.isRefetching && !transfers.isFetchingNextPage} onRefresh={() => void transfers.refetch()} tintColor={colors.primary} colors={[colors.primary]} />
            }
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (transfers.hasNextPage && !transfers.isFetchingNextPage) {
                void transfers.fetchNextPage();
              }
            }}
            ListFooterComponent={
              transfers.isFetchingNextPage ? (
                <View style={styles.loadMore}>
                  <LoadingState label="Daha çox yüklənir…" />
                </View>
              ) : null
            }
            renderItem={({ item, index }) => (
              <Entrance index={1 + Math.min(index, STAGGERED_ROWS - 1)} disabled={index >= STAGGERED_ROWS}>
                <TransferRow transfer={item} isLast={index === items.length - 1} onPress={() => router.push(`/finance/transfers/${item.id}`)} />
              </Entrance>
            )}
          />
        ) : null}
      </View>
    </Screen>
  );
}

type TransferRowProps = {
  transfer: Transfer;
  onPress: () => void;
  isLast: boolean;
};

/** One transfer: direction is readable from the swap icon and the "A → B" title, never from colour alone. */
function TransferRow({ transfer, onPress, isLast }: TransferRowProps) {
  const { colors } = useTheme();
  const crossCurrency = transfer.sourceCurrencyCode !== transfer.destinationCurrencyCode;
  const title = `${transfer.sourceAccountName} → ${transfer.destinationAccountName}`;
  const day = formatRelativeDay(transfer.occurredAtUtc);
  const meta = transfer.note ? `${day} · ${transfer.note}` : day;
  const received = formatAmount(transfer.destinationAmount, transfer.destinationCurrencyCode);
  const conversion = crossCurrency ? `→ ${received}${transfer.effectiveRate !== null ? ` · kurs ${formatRate(transfer.effectiveRate)}` : ''}` : null;
  const label = [
    spokenMoney(transfer.sourceAmount, transfer.sourceCurrencyCode, 'Transfer'),
    `${transfer.sourceAccountName} hesabından ${transfer.destinationAccountName} hesabına`,
    crossCurrency ? `daxil olur ${received}` : null,
    meta,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Köçürməni açır"
      onPress={onPress}
      scaleTo={0.99}
      containerStyle={styles.full}
      pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
      style={[styles.row, { borderBottomColor: colors.border }, isLast ? styles.last : null]}>
      <View style={[styles.icon, { backgroundColor: colors.transferSoft }]}>
        <Ionicons name="swap-horizontal-outline" size={18} color={colors.transfer} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {meta}
        </AppText>
      </View>
      <View style={styles.amounts}>
        <MoneyText amount={transfer.sourceAmount} currencyCode={transfer.sourceCurrencyCode} flow="Transfer" variant="bodyStrong" />
        {conversion ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.tabular}>
            {conversion}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    minHeight: 0,
  },
  full: {
    width: '100%',
  },
  card: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  skeletonCard: {
    padding: Spacing.lg,
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 14,
    paddingVertical: Spacing.sm + 2,
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
    gap: 1,
  },
  amounts: {
    alignItems: 'flex-end',
    gap: 1,
    flexShrink: 0,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
