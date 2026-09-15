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
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { SelectionSheet } from '@/components/selection-sheet';
import { Sheet } from '@/components/sheet';
import { ErrorState, FormSkeleton, StaleNotice } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { useToast } from '@/components/toast';
import { accountVisual } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useDebt, useRecordDebtPayment, useUndoDebtPayment } from '@/hooks/use-debts';
import { useAccounts } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import type { Debt, DebtMovement } from '@/lib/api/debts';
import { describeError } from '@/lib/api/errors';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { formatDate, formatShortDate, todayIsoDate } from '@/lib/dates';
import { describeMovement, directionLabels, dueLabel, paymentCashEffect, paymentVerb, statusLabels } from '@/lib/debts';
import { successHaptic } from '@/lib/haptics';
import { addAmounts, parseAmount } from '@/lib/money';
import { debtPaymentFormSchema, type DebtPaymentForm } from '@/lib/validation/finance';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

/**
 * One debt: what is left, how it got there, and the two things that change it — a payment, or undoing one.
 * Remaining, status and overdue all come from the server; this screen never recomputes them from the rows.
 */
export function DebtDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const detail = useDebt(id);
  const undo = useUndoDebtPayment();
  const [paying, setPaying] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    void detail.refetch().finally(() => setRefreshing(false));
  };

  if (detail.isPending) {
    return (
      <Screen testID="debt-detail">
        <ScreenHeader back title="Borc" size="compact" />
        <FormSkeleton fields={3} label="Borc yüklənir…" />
      </Screen>
    );
  }

  if (detail.isError && !detail.data) {
    return (
      <Screen testID="debt-detail">
        <ScreenHeader back title="Borc" size="compact" />
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }

  const { debt, history } = detail.data!;
  const due = dueLabel(debt);
  const settled = debt.status === 'Settled';

  const onUndo = async (movement: DebtMovement) => {
    const confirmed = await confirmAsync(
      'Ödənişi geri al',
      `${formatAmount(movement.amount, debt.currencyCode)} ödənişi geri alınsın? Qalıq ${formatAmount(addAmounts(debt.remainingAmount, movement.amount), debt.currencyCode)} olacaq və “${movement.accountName}” balansı da eyni anda geri qayıdacaq.`,
      'Geri al',
    );
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await undo.mutateAsync({ id: debt.id, paymentId: movement.id });
      successHaptic();
      toast({ title: 'Ödəniş geri alındı', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="debt-detail">
      <Entrance index={0}>
        <ScreenHeader
          back
          title={debt.counterpartyName}
          eyebrow={directionLabels[debt.direction]}
          size="compact"
          trailing={<IconButton icon="create-outline" accessibilityLabel="Borca düzəliş" accessibilityHint="Ad, son tarix və qeydi dəyişdirir" onPress={() => router.push({ pathname: '/finance/debts/[id]/edit', params: { id: debt.id } })} testID="debt-edit" />}
        />
      </Entrance>

      {detail.isError ? <StaleNotice error={detail.error} onRetry={() => void detail.refetch()} /> : null}
      <ServerErrorBanner message={serverError} />

      <Entrance index={1}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="debt-remaining-card">
          <AppText variant="caption" color="textMuted">
            {settled ? 'Bağlanıb' : 'Qalıq'}
          </AppText>
          <MoneyText variant="display" amount={debt.remainingAmount} currencyCode={debt.currencyCode} showCode testID="debt-remaining" />
          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: settled ? colors.incomeSoft : colors.surfaceSubtle }]}>
              <AppText variant="caption" color={settled ? 'incomeText' : 'textSecondary'} testID="debt-status">
                {statusLabels[debt.status]}
              </AppText>
            </View>
            {due ? (
              <View style={[styles.chip, { backgroundColor: debt.isOverdue ? colors.warningSoft : colors.surfaceSubtle }]}>
                <AppText variant="caption" color={debt.isOverdue ? 'warningText' : 'textSecondary'} testID="debt-due">
                  {due}
                </AppText>
              </View>
            ) : null}
          </View>
          <View style={styles.facts}>
            <Fact label="Əsas məbləğ" value={formatAmount(debt.principal, debt.currencyCode)} />
            <Fact label="Ödənilib" value={formatAmount(debt.paidAmount, debt.currencyCode)} testID="debt-paid" />
            <Fact label="Açılış" value={formatShortDate(debt.openedOn)} />
          </View>
          {debt.note ? (
            <AppText variant="caption" color="textSecondary">
              {debt.note}
            </AppText>
          ) : null}
          <AppText variant="caption" color="textMuted">
            {debt.direction === 'Receivable' ? 'Alacaq nağd pul deyil; hesab balansına daxil edilmir.' : 'Borc qalığı hesab balansından çıxılmır; ödəniş qeyd olunanda hesabdan çıxır.'}
          </AppText>
          {!settled ? <Button title={paymentVerb(debt.direction)} icon="cash-outline" onPress={() => setPaying(true)} testID="debt-pay" /> : null}
        </View>
      </Entrance>

      <Entrance index={2} style={styles.section}>
        <SectionHeader title="Tarixçə" caption={`${history.length} hərəkət`} />
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="debt-history">
          {history.length === 0 ? (
            <AppText variant="caption" color="textMuted" style={styles.emptyHistory}>
              Hələ hərəkət yoxdur. Borc mövcud öhdəlik kimi qeyd olunub — heç bir hesab dəyişməyib.
            </AppText>
          ) : (
            history.map((movement, index) => <MovementRow key={movement.id} debt={debt} movement={movement} separator={index > 0} busy={undo.isPending} onUndo={movement.kind === 'Payment' && !movement.isReversed ? () => void onUndo(movement) : undefined} />)
          )}
        </View>
      </Entrance>

      {paying ? <PaymentSheet debt={debt} onClose={() => setPaying(false)} /> : null}
    </Screen>
  );
}

function Fact({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="meta" testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

function MovementRow({ debt, movement, separator, busy, onUndo }: { debt: Debt; movement: DebtMovement; separator: boolean; busy: boolean; onUndo?: () => void }) {
  const { colors } = useTheme();
  const label = describeMovement(debt.direction, movement);
  const effect = movement.cashEffect;
  const spoken = `${label}, ${formatAmount(movement.amount, debt.currencyCode)}, ${movement.accountName}, ${formatDate(movement.occurredAtUtc)}${movement.isReversed ? ', geri alınıb' : ''}`;

  return (
    <View style={[styles.row, separator ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]} accessible={!onUndo} accessibilityLabel={spoken} testID={`debt-movement-${movement.id}`}>
      <View style={[styles.avatar, { backgroundColor: colors.surfaceSubtle }]}>
        <Ionicons name={movement.isReversed ? 'return-up-back-outline' : movement.kind === 'Opening' ? 'flag-outline' : 'cash-outline'} size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={movement.isReversed ? 'textMuted' : 'textPrimary'} numberOfLines={1} style={movement.isReversed ? styles.struck : null}>
          {label}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {formatDate(movement.occurredAtUtc)} · {movement.accountName}
          {movement.note ? ` · ${movement.note}` : ''}
        </AppText>
      </View>
      <View style={styles.amounts}>
        <MoneyText variant="bodyStrong" color={movement.isReversed ? 'textMuted' : undefined} amount={movement.amount} currencyCode={debt.currencyCode} showCode={false} style={movement.isReversed ? styles.struck : null} />
        <AppText variant="caption" color="textMuted">
          {movement.isReversed ? 'balans geri qayıdıb' : `hesab ${effect > 0 ? '+' : '−'}${formatAmount(Math.abs(effect), debt.currencyCode, false)}`}
        </AppText>
      </View>
      {onUndo ? <IconButton icon="arrow-undo-outline" size={18} accessibilityLabel={`Geri al: ${formatAmount(movement.amount, debt.currencyCode)}`} accessibilityHint="Ödənişi geri alır, qalığı və hesab balansını birlikdə bərpa edir" onPress={onUndo} disabled={busy} testID={`debt-undo-${movement.id}`} /> : null}
    </View>
  );
}

/**
 * A partial or full payment. The amount defaults to the full remaining balance; the account list is limited to
 * the debt's currency, and the effect on that account and on the remaining balance is shown before confirming.
 * One idempotency key per opening, so a retried tap cannot pay twice.
 */
function PaymentSheet({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const pay = useRecordDebtPayment();
  const accounts = useAccounts();
  const requestId = useClientRequestId();
  const [accountSheet, setAccountSheet] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  // Mounted per opening: the amount starts at the full remaining balance and the idempotency key is fresh.
  const { control, handleSubmit, setValue, setError } = useForm<DebtPaymentForm>({
    resolver: zodResolver(debtPaymentFormSchema),
    defaultValues: { accountId: '', amount: String(debt.remainingAmount), date: todayIsoDate(), note: '' },
  });
  const [accountId, amountText] = useWatch({ control, name: ['accountId', 'amount'] });

  const eligible = (accounts.data ?? []).filter((account) => account.currencyCode === debt.currencyCode && !account.isArchived);
  const account = eligible.find((candidate) => candidate.id === accountId);
  const amount = parseAmount(amountText ?? '') ?? 0;
  const remainingAfter = addAmounts(debt.remainingAmount, -amount);
  const title = paymentVerb(debt.direction);

  const submit = () => {
    void handleSubmit(
      async (values) => {
        const paying = parseAmount(values.amount)!;
        if (paying > debt.remainingAmount) {
          setError('amount', { message: `Qalıqdan çox ola bilməz (${formatAmount(debt.remainingAmount, debt.currencyCode)}).` });
          setShakeKey((key) => key + 1);
          return;
        }
        setServerError(null);
        try {
          await pay.mutateAsync({
            id: debt.id,
            input: { accountId: values.accountId, amount: paying, paidOn: values.date, note: values.note.trim() === '' ? null : values.note.trim() },
            clientRequestId: requestId.current(),
          });
          successHaptic();
          toast({ title: `${title}: ${formatAmount(paying, debt.currencyCode)}`, tone: 'success' });
          onClose();
        } catch (error) {
          // Typed values stay; a conflict (concurrent payment, settled meanwhile) is shown with the sheet open.
          setServerError(describeError(error));
        }
      },
      () => setShakeKey((key) => key + 1),
    )();
  };

  return (
    <Sheet visible onClose={onClose} title={title} accessibilityLabel={`${title}: ${debt.counterpartyName}`} footer={<Button title="Təsdiqlə və qeyd et" onPress={submit} loading={pay.isPending} testID="payment-confirm" />} testID="payment-sheet">
      <View style={styles.sheetBody}>
        <AppText color="textSecondary">
          {debt.counterpartyName} · qalıq <MoneyText color="textSecondary" amount={debt.remainingAmount} currencyCode={debt.currencyCode} />. Qismən və ya tam ödəniş qeyd edə bilərsiniz.
        </AppText>
        <ServerErrorBanner message={serverError} />
        <Controller
          control={control}
          name="amount"
          render={({ field, fieldState }) => (
            <AmountInput label="Məbləğ" layout="field" value={field.value} onChangeText={field.onChange} currencyCode={debt.currencyCode} error={fieldState.error?.message} shakeKey={shakeKey} flow={debt.direction === 'Receivable' ? 'Income' : 'Expense'} testID="payment-amount" />
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
              hint={account ? `${accountVisual(account.type).label} · ${account.currencyCode}` : `Yalnız ${debt.currencyCode} hesabları`}
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
          render={({ field, fieldState }) => <TextField label="Qeyd (istəyə bağlı)" icon="create-outline" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} testID="payment-note" />}
        />
        <AccountEffect account={account} delta={amount > 0 ? paymentCashEffect(debt.direction, amount) : null} testID="payment-effect" />
        <View style={[styles.note, { backgroundColor: colors.surfaceSubtle }]} accessible accessibilityLabel={`Qalıq: ${formatAmount(debt.remainingAmount, debt.currencyCode)} → ${formatAmount(Math.max(0, remainingAfter), debt.currencyCode)}`} testID="payment-remaining-after">
          <Ionicons name="trending-down-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Qalıq: <MoneyText variant="caption" color="textSecondary" amount={debt.remainingAmount} currencyCode={debt.currencyCode} showCode={false} /> →{' '}
            <MoneyText variant="caption" color={remainingAfter < 0 ? 'error' : 'textPrimary'} amount={Math.max(0, remainingAfter)} currencyCode={debt.currencyCode} />
            {remainingAfter === 0 && amount > 0 ? ' · borc bağlanır' : ''}. Gəlir/xərc cəmləri və büdcələr dəyişmir.
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
        emptyMessage={`${debt.currencyCode} valyutasında aktiv hesab yoxdur.`}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  section: {
    gap: Spacing.sm,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  facts: {
    flexDirection: 'row',
    gap: Spacing.lg,
    flexWrap: 'wrap',
    paddingTop: Spacing.xs,
  },
  fact: {
    gap: 2,
  },
  list: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
  },
  emptyHistory: {
    paddingVertical: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget + 8,
    paddingVertical: Spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amounts: {
    alignItems: 'flex-end',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  sheetBody: {
    gap: Spacing.md,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
});
