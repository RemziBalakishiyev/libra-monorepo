import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { AccountEffect } from '@/components/account-effect';
import { AmountInput } from '@/components/amount-input';
import { Button, IconButton } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { SelectRow, TextField } from '@/components/form-field';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SelectionSheet } from '@/components/selection-sheet';
import { Sheet } from '@/components/sheet';
import { EmptyState, ErrorState, ListSkeleton, StaleNotice } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { useToast } from '@/components/toast';
import { accountVisual } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-finance';
import { useRecordOccurrence, useRecurringMonth, useSkipOccurrence, useUndoOccurrence } from '@/hooks/use-recurring';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { RecurringOccurrence } from '@/lib/api/recurring';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { currentYearMonth, formatMonth, formatShortDate, todayIsoDate } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/money';
import { recordOccurrenceFormSchema, type RecordOccurrenceForm } from '@/lib/validation/finance';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

type Period = { year: number; month: number };

function shiftPeriod(period: Period, delta: number): Period {
  const index = period.year * 12 + (period.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const statusLabels = { Pending: 'Gözləyir', Recorded: 'Qeyd olunub', Skipped: 'Buraxılıb' } as const;

/**
 * Təkrarlananlar: the selected month's planned incomes and expenses. Everything on this screen is a plan
 * until the user presses "Gəliri qeyd et" / "Ödənişi qeyd et", reviews the amount, account and date, and
 * confirms — opening it, refreshing it or moving between months never records anything.
 */
export function RecurringListScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const toast = useToast();
  const [today] = useState<Period>(() => currentYearMonth());
  const [period, setPeriod] = useState<Period>(today);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewing, setReviewing] = useState<RecurringOccurrence | null>(null);
  const month = useRecurringMonth(period.year, period.month);
  const skip = useSkipOccurrence();
  const undo = useUndoOccurrence();
  const wide = layout === 'wide';
  const isCurrentMonth = period.year === today.year && period.month === today.month;
  const monthLabel = formatMonth(period.year, period.month);

  const onRefresh = () => {
    setRefreshing(true);
    void month.refetch().finally(() => setRefreshing(false));
  };

  const onSkip = async (item: RecurringOccurrence) => {
    const confirmed = await confirmAsync('Bu ayı burax', `“${item.title}” ${monthLabel} üçün qeyd olunmayacaq. Sonra istəsəniz yenə qeyd edə bilərsiniz.`, 'Burax', false);
    if (!confirmed) {
      return;
    }
    try {
      await skip.mutateAsync({ templateId: item.templateId, year: item.year, month: item.month });
      toast({ title: 'Ay buraxıldı', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const onUndo = async (item: RecurringOccurrence) => {
    const confirmed = await confirmAsync(
      'Qeydi geri al',
      `“${item.title}” · ${formatAmount(item.amount, item.currencyCode)} əməliyyatı silinəcək və ${monthLabel} “buraxılıb” kimi qalacaq.`,
      'Geri al',
    );
    if (!confirmed) {
      return;
    }
    try {
      await undo.mutateAsync({ templateId: item.templateId, year: item.year, month: item.month });
      toast({ title: 'Qeyd geri alındı', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const totals = month.data ? (
    <View style={[styles.totals, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="recurring-totals">
      <TotalsColumn title="Gözləyir" items={month.data.pendingTotals} tone="textSecondary" testID="recurring-pending-total" />
      <View style={[styles.totalsDivider, { backgroundColor: colors.border }]} />
      <TotalsColumn title="Qeyd olunub" items={month.data.recordedTotals} tone="textPrimary" testID="recurring-recorded-total" />
    </View>
  ) : null;

  const body = (() => {
    if (month.isPending) {
      return <ListSkeleton rows={3} label="Təkrarlananlar yüklənir…" />;
    }
    if (month.isError && !month.data) {
      return <ErrorState error={month.error} onRetry={() => void month.refetch()} />;
    }
    const items = month.data?.occurrences ?? [];
    if (items.length === 0) {
      return (
        <EmptyState
          icon="repeat-outline"
          accent={colors.moduleFinance}
          title="Bu ay üçün plan yoxdur"
          message="Kirayə, maaş və ya abunə kimi hər ay təkrarlanan gəlir və xərcləri əlavə edin. Heç nə avtomatik qeyd olunmur — hər ayı özünüz təsdiqləyirsiniz."
          actionTitle="Şablon əlavə et"
          onAction={() => router.push('/finance/recurring/new')}
          compact
        />
      );
    }
    return (
      <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="recurring-list">
        {items.map((item, index) => (
          <OccurrenceRow
            key={`${item.templateId}-${item.year}-${item.month}`}
            item={item}
            separator={index > 0}
            busy={skip.isPending || undo.isPending}
            onRecord={() => setReviewing(item)}
            onSkip={() => void onSkip(item)}
            onUndo={() => void onUndo(item)}
            onOpenTransaction={() => router.push(`/finance/transactions/${item.transactionId}`)}
            onEdit={() => router.push({ pathname: '/finance/recurring/[id]', params: { id: item.templateId } })}
          />
        ))}
      </View>
    );
  })();

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="recurring-screen">
      <Entrance index={0}>
        <ScreenHeader
          back
          title="Təkrarlananlar"
          eyebrow="Maliyyə"
          size="compact"
          trailing={<IconButton icon="add" accessibilityLabel="Şablon əlavə et" accessibilityHint="Yeni təkrarlanan gəlir və ya xərc yaradır" variant="primary" onPress={() => router.push('/finance/recurring/new')} testID="recurring-add" />}
        />
      </Entrance>

      <Entrance index={1} style={styles.toolbar}>
        <View style={styles.periodRow}>
          <IconButton icon="chevron-back" accessibilityLabel="Əvvəlki ay" variant="filled" onPress={() => setPeriod((current) => shiftPeriod(current, -1))} testID="recurring-prev" />
          <AppText variant="subheading" align="center" style={styles.periodLabel} accessibilityLiveRegion="polite" accessibilityLabel={`Dövr: ${monthLabel}`} testID="recurring-period">
            {monthLabel}
          </AppText>
          <IconButton icon="chevron-forward" accessibilityLabel="Növbəti ay" variant="filled" onPress={() => setPeriod((current) => shiftPeriod(current, 1))} testID="recurring-next" />
        </View>
        {!isCurrentMonth ? <Button title="Bu aya qayıt" variant="ghost" size="sm" icon="today-outline" onPress={() => setPeriod(today)} /> : null}
      </Entrance>

      {month.isError && month.data ? <StaleNotice error={month.error} onRetry={() => void month.refetch()} /> : null}

      {wide ? (
        <View style={styles.columns}>
          <Entrance index={2} style={styles.columnMain}>
            {body}
          </Entrance>
          <Entrance index={3} style={styles.columnSide}>
            {totals}
          </Entrance>
        </View>
      ) : (
        <>
          <Entrance index={2}>{totals}</Entrance>
          <Entrance index={3}>{body}</Entrance>
        </>
      )}

      {reviewing ? <RecordSheet occurrence={reviewing} onClose={() => setReviewing(null)} monthLabel={monthLabel} /> : null}
    </Screen>
  );
}

function TotalsColumn({ title, items, tone, testID }: { title: string; items: readonly { currencyCode: string; income: number; expense: number }[]; tone: 'textSecondary' | 'textPrimary'; testID: string }) {
  return (
    <View style={styles.totalsColumn} testID={testID}>
      <AppText variant="caption" color="textMuted">
        {title}
      </AppText>
      {items.length === 0 ? (
        <AppText variant="meta" color="textMuted">
          —
        </AppText>
      ) : (
        items.map((total) => (
          <View key={total.currencyCode} style={styles.totalsLine}>
            {total.income > 0 ? <MoneyText variant="meta" flow="Income" amount={total.income} currencyCode={total.currencyCode} showCode={false} /> : null}
            {total.expense > 0 ? <MoneyText variant="meta" flow="Expense" amount={total.expense} currencyCode={total.currencyCode} showCode={false} /> : null}
            <AppText variant="caption" color={tone}>
              {total.currencyCode}
            </AppText>
          </View>
        ))
      )}
    </View>
  );
}

type OccurrenceRowProps = {
  item: RecurringOccurrence;
  separator: boolean;
  busy: boolean;
  onRecord: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onOpenTransaction: () => void;
  onEdit: () => void;
};

/** One plan in one month: what, when, how much, and the one action that fits its state. */
function OccurrenceRow({ item, separator, busy, onRecord, onSkip, onUndo, onOpenTransaction, onEdit }: OccurrenceRowProps) {
  const { colors } = useTheme();
  const recordTitle = item.type === 'Income' ? 'Gəliri qeyd et' : 'Ödənişi qeyd et';
  const statusColor = item.status === 'Recorded' ? colors.incomeSoft : item.status === 'Skipped' ? colors.surfaceSubtle : colors.warningSoft;
  const statusText = item.status === 'Recorded' ? 'incomeText' : item.status === 'Skipped' ? 'textMuted' : 'warningText';

  return (
    <View style={[styles.row, separator ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]} testID={`recurring-row-${item.templateId}`}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${formatAmount(item.amount, item.currencyCode)}, ${statusLabels[item.status]}, ${formatShortDate(item.dueDate)}`}
        accessibilityHint="Şablonu açır"
        onPress={onEdit}
        scaleTo={0.995}
        containerStyle={styles.flex}
        pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
        style={styles.rowBody}>
        <View style={[styles.rowIcon, { backgroundColor: item.type === 'Income' ? colors.incomeSoft : colors.expenseSoft }]}>
          <Ionicons name={item.type === 'Income' ? 'arrow-down-outline' : 'arrow-up-outline'} size={16} color={item.type === 'Income' ? colors.income : colors.expense} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {item.title}
          </AppText>
          <View style={styles.metaRow}>
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.flexShrink}>
              {formatShortDate(item.dueDate)} · {item.accountName}
            </AppText>
            <View style={[styles.chip, { backgroundColor: statusColor }]}>
              <AppText variant="caption" color={statusText} testID={`recurring-status-${item.templateId}`}>
                {statusLabels[item.status]}
              </AppText>
            </View>
          </View>
        </View>
        <MoneyText variant="bodyStrong" flow={item.type} amount={item.amount} currencyCode={item.currencyCode} showCode={false} />
      </PressableScale>

      <View style={styles.actions}>
        {item.status === 'Pending' ? (
          <>
            <Button title={recordTitle} size="sm" icon="checkmark-circle-outline" onPress={onRecord} disabled={busy} testID={`recurring-record-${item.templateId}`} />
            <Button title="Burax" variant="ghost" size="sm" onPress={onSkip} disabled={busy} testID={`recurring-skip-${item.templateId}`} />
          </>
        ) : null}
        {item.status === 'Recorded' ? (
          <>
            <Button title="Əməliyyata bax" variant="soft" size="sm" icon="receipt-outline" onPress={onOpenTransaction} testID={`recurring-open-${item.templateId}`} />
            <Button title="Geri al" variant="ghost" size="sm" onPress={onUndo} disabled={busy} testID={`recurring-undo-${item.templateId}`} />
          </>
        ) : null}
        {item.status === 'Skipped' ? (
          <Button title={recordTitle} variant="soft" size="sm" icon="checkmark-circle-outline" onPress={onRecord} disabled={busy} testID={`recurring-record-${item.templateId}`} />
        ) : null}
      </View>
    </View>
  );
}

type RecordSheetProps = {
  occurrence: RecurringOccurrence;
  monthLabel: string;
  onClose: () => void;
};

/**
 * The review before money is recorded: amount, account and the actual date can all be changed; the effect on the
 * chosen account is shown before confirming. One client request id per opening of the sheet, so a retried
 * confirmation cannot record twice — and the server's month rule catches even a retry with a different key.
 */
function RecordSheet({ occurrence, monthLabel, onClose }: RecordSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const record = useRecordOccurrence();
  const accounts = useAccounts();
  const requestId = useClientRequestId();
  const [accountSheet, setAccountSheet] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  // Mounted per opening, so the form starts from the occurrence's own values and a fresh idempotency key.
  const { control, handleSubmit, setValue } = useForm<RecordOccurrenceForm>({
    resolver: zodResolver(recordOccurrenceFormSchema),
    // The actual date: the due date once it has passed, otherwise today — a confirmation says the money moved now.
    defaultValues: { accountId: occurrence.accountId, amount: String(occurrence.amount), date: occurrence.dueDate < todayIsoDate() ? occurrence.dueDate : todayIsoDate(), note: '' },
  });
  const [accountId, amountText] = useWatch({ control, name: ['accountId', 'amount'] });

  const eligible = (accounts.data ?? []).filter((account) => account.currencyCode === occurrence.currencyCode && !account.isArchived);
  const account = eligible.find((candidate) => candidate.id === accountId);
  const amount = parseAmount(amountText ?? '') ?? 0;
  const delta = occurrence.type === 'Income' ? amount : -amount;
  const title = occurrence.type === 'Income' ? 'Gəliri qeyd et' : 'Ödənişi qeyd et';

  const submit = () => {
    void handleSubmit(
      async (values) => {
        setServerError(null);
        try {
          await record.mutateAsync({
            templateId: occurrence.templateId,
            year: occurrence.year,
            month: occurrence.month,
            input: { accountId: values.accountId, amount: parseAmount(values.amount)!, occurredOn: values.date, note: values.note.trim() === '' ? null : values.note.trim() },
            clientRequestId: requestId.current(),
          });
          successHaptic();
          toast({ title: `${occurrence.title} · ${monthLabel} qeyd olundu`, tone: 'success' });
          onClose();
        } catch (error) {
          // Everything typed stays; a conflict (already recorded, stale) is shown with the sheet still open.
          setServerError(describeError(error));
        }
      },
      () => setShakeKey((key) => key + 1),
    )();
  };

  return (
    <Sheet visible onClose={onClose} title={title} accessibilityLabel={`${title}: ${occurrence.title}`} footer={<Button title="Təsdiqlə və qeyd et" onPress={submit} loading={record.isPending} testID="record-confirm" />} testID="record-sheet">
      <View style={styles.sheetBody}>
        <AppText color="textSecondary">
          {occurrence.title} · {monthLabel}. Bu, bank ödənişi başlatmır — yalnız Libra-da əməliyyat kimi qeyd edir.
        </AppText>
        <ServerErrorBanner message={serverError} />
        <Controller
          control={control}
          name="amount"
          render={({ field, fieldState }) => (
            <AmountInput label="Məbləğ" layout="field" value={field.value} onChangeText={field.onChange} currencyCode={occurrence.currencyCode} error={fieldState.error?.message} shakeKey={shakeKey} flow={occurrence.type} testID="record-amount" />
          )}
        />
        <Controller
          control={control}
          name="accountId"
          render={({ fieldState }) => (
            <SelectRow
              label="Hesab"
              value={account?.name}
              placeholder="Hesab seçin"
              hint={account ? `${accountVisual(account.type).label} · ${account.currencyCode}` : `Yalnız ${occurrence.currencyCode} hesabları`}
              icon={account ? accountVisual(account.type).icon : 'wallet-outline'}
              error={fieldState.error?.message}
              onPress={() => setAccountSheet(true)}
            />
          )}
        />
        <Controller
          control={control}
          name="date"
          render={({ field, fieldState }) => <DateField label="Faktiki tarix" value={field.value} onChange={field.onChange} error={fieldState.error?.message} maximumDate={new Date()} />}
        />
        <Controller
          control={control}
          name="note"
          render={({ field, fieldState }) => <TextField label="Qeyd (istəyə bağlı)" icon="create-outline" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} testID="record-note" />}
        />
        <AccountEffect account={account} delta={amount > 0 ? delta : null} testID="record-effect" />
        <View style={[styles.note, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Təsdiqdən sonra bir adi əməliyyat yaranır və balansa, aylıq cəmlərə və büdcəyə bir dəfə təsir edir. Səhv olsa, siyahıdan “Geri al” ilə silə bilərsiniz.
          </AppText>
        </View>
      </View>
      <SelectionSheet
        visible={accountSheet}
        title="Hesab"
        value={accountId ?? ''}
        options={eligible.map((item) => ({ value: item.id, label: item.name, hint: `${accountVisual(item.type).label} · ${item.currencyCode}`, icon: accountVisual(item.type).icon, iconColor: colors.primary, trailing: <MoneyText variant="meta" color="textSecondary" amount={item.currentBalance} currencyCode={item.currencyCode} showCode={false} /> }))}
        onSelect={(value) => {
          setValue('accountId', value, { shouldValidate: true });
          setAccountSheet(false);
        }}
        onClose={() => setAccountSheet(false)}
        emptyMessage={`${occurrence.currencyCode} valyutasında aktiv hesab yoxdur.`}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  flexShrink: {
    flexShrink: 1,
  },
  toolbar: {
    gap: Spacing.xs,
    alignItems: 'center',
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'stretch',
  },
  periodLabel: {
    flex: 1,
  },
  columns: {
    flexDirection: 'row',
    gap: Spacing.huge,
    alignItems: 'flex-start',
  },
  columnMain: {
    flex: 7,
  },
  columnSide: {
    flex: 5,
  },
  totals: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.md,
  },
  totalsColumn: {
    flex: 1,
    gap: Spacing.xxs,
  },
  totalsDivider: {
    width: StyleSheet.hairlineWidth,
  },
  totalsLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  list: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
  },
  row: {
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  rowBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget,
    borderRadius: Radius.md,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    paddingLeft: 40,
  },
  sheetBody: {
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
});
