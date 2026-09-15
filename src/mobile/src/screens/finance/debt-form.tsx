import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View, type ScrollView, type TextInput } from 'react-native';

import { AccountEffect } from '@/components/account-effect';
import { AmountInput } from '@/components/amount-input';
import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { SelectRow, TextField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { SelectionSheet } from '@/components/selection-sheet';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { accountVisual } from '@/constants/categories';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useCreateDebt, useDebt, useDeleteDebt, useUpdateDebt } from '@/hooks/use-debts';
import { useAccounts } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import type { Debt, DebtDirection } from '@/lib/api/debts';
import { describeError } from '@/lib/api/errors';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { todayIsoDate } from '@/lib/dates';
import { directionLabels, openingCashEffect } from '@/lib/debts';
import { successHaptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/money';
import { debtFormSchema, type DebtForm } from '@/lib/validation/finance';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

const SUCCESS_DELAY_MS = 550;
const LOCKED_REASON = 'Ödəniş qeyd olunduqdan sonra məbləğ və açılış tarixi dəyişmir.';

export function DebtFormScreen({ id, direction }: { id?: string; direction?: DebtDirection }) {
  const existing = useDebt(id);
  const title = id ? 'Borca düzəliş' : 'Yeni borc';

  if (id && existing.isPending) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} size="compact" />
        <FormSkeleton fields={5} />
      </Screen>
    );
  }

  if (id && existing.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} size="compact" />
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }

  return <DebtEditor debt={existing.data?.debt} initialDirection={direction} />;
}

type Phase = 'idle' | 'submitting' | 'success';
type Origin = 'existing' | 'now';

function defaultsFor(debt: Debt | undefined, direction: DebtDirection, currencyCode: string): DebtForm {
  return {
    direction: debt?.direction ?? direction,
    counterpartyName: debt?.counterpartyName ?? '',
    principal: debt ? String(debt.principal) : '',
    currencyCode: debt?.currencyCode ?? currencyCode,
    openedOn: debt?.openedOn ?? todayIsoDate(),
    dueOn: debt?.dueOn ?? '',
    note: debt?.note ?? '',
    movesCash: false,
    accountId: '',
  };
}

/**
 * Creating a debt is explicit about cash. "Artıq mövcuddur" records an obligation and leaves every balance
 * alone; "İndi verilir / alınır" moves the principal through one account in the same request as the debt.
 * Once a movement exists, the principal and opening date are locked — the name, due date and note stay editable.
 */
function DebtEditor({ debt, initialDirection }: { debt: Debt | undefined; initialDirection: DebtDirection | undefined }) {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const toast = useToast();
  const create = useCreateDebt();
  const update = useUpdateDebt();
  const remove = useDeleteDebt();
  const requestId = useClientRequestId();
  const accounts = useAccounts();
  const [phase, setPhase] = useState<Phase>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [accountSheet, setAccountSheet] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const wide = layout === 'wide';
  const activeAccounts = (accounts.data ?? []).filter((item) => !item.isArchived);
  const fallbackCurrency = activeAccounts[0]?.currencyCode ?? 'AZN';

  const { control, handleSubmit, setValue } = useForm<DebtForm>({
    resolver: zodResolver(debtFormSchema),
    defaultValues: defaultsFor(debt, initialDirection ?? 'Receivable', fallbackCurrency),
  });
  const [direction, movesCash, accountId, principalText, currencyCode, dueOn] = useWatch({ control, name: ['direction', 'movesCash', 'accountId', 'principal', 'currencyCode', 'dueOn'] });
  const account = activeAccounts.find((candidate) => candidate.id === accountId);
  const principal = parseAmount(principalText ?? '');
  const locked = Boolean(debt?.hasMovements);
  const busy = phase === 'submitting' || remove.isPending;

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  const submit = () => {
    if (phase !== 'idle') {
      return;
    }
    void handleSubmit(
      async (values) => {
        setServerError(null);
        setPhase('submitting');
        const amount = parseAmount(values.principal)!;
        const note = values.note.trim() === '' ? null : values.note.trim();
        const dueOn = values.dueOn === '' ? null : values.dueOn;
        try {
          if (debt) {
            await update.mutateAsync({
              id: debt.id,
              input: { counterpartyName: values.counterpartyName.trim(), principal: locked ? debt.principal : amount, openedOn: locked ? debt.openedOn : values.openedOn, dueOn, note, expectedUpdatedAtUtc: debt.updatedAtUtc },
            });
          } else {
            const chosen = values.movesCash ? activeAccounts.find((item) => item.id === values.accountId) : undefined;
            await create.mutateAsync({
              input: {
                direction: values.direction,
                counterpartyName: values.counterpartyName.trim(),
                principal: amount,
                currencyCode: chosen ? chosen.currencyCode : values.currencyCode,
                openedOn: values.openedOn,
                dueOn,
                note,
                accountId: values.movesCash ? values.accountId : null,
              },
              clientRequestId: requestId.current(),
            });
            requestId.reset();
          }
          setPhase('success');
          successHaptic();
          doneTimer.current = setTimeout(() => {
            doneTimer.current = null;
            router.back();
            toast({ title: debt ? 'Borc yeniləndi' : 'Borc əlavə olundu', tone: 'success' });
          }, SUCCESS_DELAY_MS);
        } catch (error) {
          setPhase('idle');
          setServerError(describeError(error));
        }
      },
      () => {
        setShakeKey((key) => key + 1);
        nameRef.current?.focus();
      },
    )();
  };

  const onDelete = async () => {
    if (!debt) {
      return;
    }
    const confirmed = await confirmAsync('Borcu sil', `“${debt.counterpartyName}” qeydi silinsin? Ödənişi olan borc silinmir.`);
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await remove.mutateAsync(debt.id);
      router.dismissTo('/finance/debts');
      toast({ title: 'Borc silindi', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const origin: Origin = movesCash ? 'now' : 'existing';
  const lockIcon = <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} accessibilityLabel={LOCKED_REASON} />;

  const form = (
    <>
      {debt ? (
        <View style={[styles.explainer, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name={debt.direction === 'Receivable' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'} size={16} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            {directionLabels[debt.direction]} · {debt.currencyCode}. İstiqamət və valyuta dəyişmir.
          </AppText>
        </View>
      ) : (
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <SegmentedControl
              accessibilityLabel="İstiqamət"
              testID="debt-form-direction"
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
              options={[
                { value: 'Receivable', label: directionLabels.Receivable, icon: 'arrow-down-circle-outline' },
                { value: 'Payable', label: directionLabels.Payable, icon: 'arrow-up-circle-outline' },
              ]}
            />
          )}
        />
      )}
      <Controller
        control={control}
        name="counterpartyName"
        render={({ field, fieldState }) => (
          <TextField
            ref={nameRef}
            label="Qarşı tərəf"
            icon="person-outline"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            editable={!busy}
            placeholder={direction === 'Receivable' ? 'Kim borcludur?' : 'Kimə borclusunuz?'}
            autoFocus={!debt}
            testID="debt-form-name"
          />
        )}
      />
      <Controller
        control={control}
        name="principal"
        render={({ field, fieldState }) => (
          <AmountInput
            label="Əsas məbləğ"
            layout="field"
            value={field.value}
            onChangeText={field.onChange}
            currencyCode={movesCash ? account?.currencyCode : currencyCode}
            error={fieldState.error?.message}
            shakeKey={shakeKey}
            editable={!busy && !locked}
            helper={locked ? LOCKED_REASON : 'Yalnız əsas məbləğ; faiz hesablanmır.'}
            testID="debt-form-principal"
          />
        )}
      />

      {!debt ? (
        <>
          <View style={styles.originBlock}>
            <AppText variant="caption" color="textSecondary">
              Pul hərəkəti
            </AppText>
            <SegmentedControl
              accessibilityLabel="Pul hərəkəti"
              testID="debt-form-origin"
              value={origin}
              onChange={(value) => setValue('movesCash', value === 'now', { shouldValidate: true })}
              disabled={busy}
              options={[
                { value: 'existing', label: 'Artıq mövcuddur', icon: 'document-text-outline' },
                { value: 'now', label: direction === 'Receivable' ? 'İndi verirəm' : 'İndi alıram', icon: 'swap-horizontal-outline' },
              ]}
            />
            <AppText variant="caption" color="textMuted">
              {movesCash
                ? direction === 'Receivable'
                  ? 'Məbləğ seçilən hesabdan çıxır və alacaq kimi qeyd olunur.'
                  : 'Məbləğ seçilən hesaba daxil olur və borc kimi qeyd olunur.'
                : 'Heç bir hesabın balansı dəyişmir; yalnız öhdəlik qeyd olunur.'}
            </AppText>
          </View>
          {movesCash ? (
            <Controller
              control={control}
              name="accountId"
              render={({ fieldState }) => (
                <SelectRow
                  label="Hesab"
                  value={account?.name}
                  placeholder="Hesab seçin"
                  hint={account ? `${accountVisual(account.type).label} · ${account.currencyCode} · valyuta bu hesabdan götürülür` : 'Borcun valyutası seçilən hesabdan götürülür'}
                  icon={account ? accountVisual(account.type).icon : 'wallet-outline'}
                  error={fieldState.error?.message}
                  disabled={busy}
                  onPress={() => setAccountSheet(true)}
                />
              )}
            />
          ) : (
            <Controller
              control={control}
              name="currencyCode"
              render={({ field, fieldState }) => (
                <TextField
                  label="Valyuta"
                  icon="cash-outline"
                  value={field.value}
                  onChangeText={(next: string) => field.onChange(next.toUpperCase())}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  hint="ISO 4217, məs. AZN. Ödənişlər yalnız bu valyutadakı hesablardan qeyd olunur."
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={3}
                  editable={!busy}
                  testID="debt-form-currency"
                />
              )}
            />
          )}
          {movesCash ? <AccountEffect account={account} delta={principal ? openingCashEffect(direction, principal) : 0} testID="debt-form-effect" /> : null}
        </>
      ) : null}

      <View style={styles.datesRow}>
        <Controller
          control={control}
          name="openedOn"
          render={({ field, fieldState }) => (
            <View style={styles.flex}>
              <DateField label="Açılış tarixi" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy || locked} />
            </View>
          )}
        />
        {dueOn !== '' ? (
          <Controller
            control={control}
            name="dueOn"
            render={({ field, fieldState }) => (
              <View style={styles.flex}>
                <DateField label="Son tarix" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
              </View>
            )}
          />
        ) : null}
      </View>
      {dueOn === '' ? (
        <View style={styles.dueRow}>
          <AppText variant="caption" color="textMuted" style={styles.flex}>
            Son tarix qoyulmayıb — borc gecikmiş sayılmır.
          </AppText>
          <Button title="Son tarix əlavə et" variant="ghost" size="sm" icon="calendar-outline" onPress={() => setValue('dueOn', todayIsoDate(), { shouldValidate: true })} disabled={busy} testID="debt-form-add-due" />
        </View>
      ) : (
        <Button title="Son tarixi sil" variant="ghost" size="sm" icon="close-outline" onPress={() => setValue('dueOn', '', { shouldValidate: true })} disabled={busy} />
      )}
      <Controller
        control={control}
        name="note"
        render={({ field, fieldState }) => <TextField label="Qeyd (istəyə bağlı)" icon="create-outline" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} editable={!busy} testID="debt-form-note" />}
      />

      {debt ? (
        <View style={styles.dangerZone}>
          {locked ? (
            <View style={[styles.explainer, { backgroundColor: colors.surfaceSubtle }]}>
              {lockIcon}
              <AppText variant="caption" color="textSecondary" style={styles.flex}>
                {LOCKED_REASON} Səhv ödənişi tarixçədən geri ala bilərsiniz.
              </AppText>
            </View>
          ) : (
            <Button title="Borcu sil" variant="danger" icon="trash-outline" onPress={() => void onDelete()} disabled={busy} loading={remove.isPending} testID="debt-form-delete" />
          )}
        </View>
      ) : null}
    </>
  );

  return (
    <Screen
      scrollRef={scrollRef}
      maxWidth={wide ? Layout.maxFormWide : Layout.maxForm}
      testID="debt-form"
      footer={<Button title={debt ? 'Yadda saxla' : 'Borc əlavə et'} onPress={submit} loading={phase === 'submitting'} success={phase === 'success'} successTitle={debt ? 'Yadda saxlanıldı' : 'Əlavə olundu'} testID="debt-form-submit" />}>
      <Entrance style={styles.stack}>
        <ScreenHeader back title={debt ? 'Borca düzəliş' : 'Yeni borc'} size="compact" />
        <ServerErrorBanner message={serverError} />
        {form}
      </Entrance>

      <SelectionSheet
        visible={accountSheet}
        title="Hesab"
        value={accountId ?? ''}
        options={activeAccounts.map((item) => ({ value: item.id, label: item.name, hint: `${accountVisual(item.type).label} · ${item.currencyCode}`, icon: accountVisual(item.type).icon, iconColor: colors.primary }))}
        onSelect={(value) => {
          setValue('accountId', value, { shouldValidate: true });
          setAccountSheet(false);
        }}
        onClose={() => setAccountSheet(false)}
        emptyMessage="Aktiv hesab yoxdur. Əvvəlcə hesab yaradın."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  stack: {
    gap: Spacing.lg,
  },
  originBlock: {
    gap: Spacing.sm,
  },
  datesRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  explainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  dangerZone: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
});
