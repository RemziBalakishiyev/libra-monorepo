import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { SelectRow, TextField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SelectionSheet } from '@/components/selection-sheet';
import { EmptyState, ErrorState, FormSkeleton } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { useToast } from '@/components/toast';
import { accountVisual } from '@/constants/categories';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useAccounts, useCreateTransfer, useDeleteTransfer, useTransfer, useUpdateTransfer } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Account, Transfer } from '@/lib/api/finance';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { localDateToUtcIso, todayIsoDate, utcIsoToLocalDate } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/money';
import { transferFormSchema, type TransferForm } from '@/lib/validation/finance';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

const SUCCESS_DELAY_MS = 550;

export function TransferFormScreen({ id }: { id?: string }) {
  const router = useRouter();
  const existing = useTransfer(id);
  const accounts = useAccounts();
  const title = id ? 'Köçürmə' : 'Yeni köçürmə';

  if ((id && existing.isPending) || accounts.isPending) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} />
        <FormSkeleton fields={5} />
      </Screen>
    );
  }

  if (id && existing.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} />
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }

  if (accounts.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} />
        <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
      </Screen>
    );
  }

  const activeAccounts = accounts.data ?? [];
  if (!existing.data && activeAccounts.length < 2) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} />
        <EmptyState
          icon="swap-horizontal-outline"
          title="Köçürmə üçün iki hesab lazımdır"
          message="Köçürmə hesablar arasında aparılır. İkinci hesabı (məsələn, bank kartı və ya yığım) yaradın, sonra köçürmə edə bilərsiniz."
          actionTitle="Hesab yarat"
          onAction={() => router.push('/finance/accounts/new')}
        />
      </Screen>
    );
  }

  return <TransferEditor transfer={existing.data} accounts={activeAccounts} />;
}

type EditorProps = {
  transfer: Transfer | undefined;
  accounts: Account[];
};

type Phase = 'idle' | 'submitting' | 'success';

export function TransferEditor({ transfer, accounts }: EditorProps) {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const toast = useToast();
  const create = useCreateTransfer();
  const update = useUpdateTransfer();
  const remove = useDeleteTransfer();
  const requestId = useClientRequestId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const [sheet, setSheet] = useState<'source' | 'destination' | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { control, handleSubmit, formState, setValue } = useForm<TransferForm>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      sourceAccountId: transfer?.sourceAccountId ?? '',
      destinationAccountId: transfer?.destinationAccountId ?? '',
      sourceAmount: transfer ? String(transfer.sourceAmount) : '',
      destinationAmount: transfer ? String(transfer.destinationAmount) : '',
      sameCurrency: transfer ? transfer.sourceCurrencyCode === transfer.destinationCurrencyCode : true,
      date: transfer ? utcIsoToLocalDate(transfer.occurredAtUtc) : todayIsoDate(),
      note: transfer?.note ?? '',
    },
  });
  const [sourceId, destinationId, sourceAmountText, destinationAmountText] = useWatch({
    control,
    name: ['sourceAccountId', 'destinationAccountId', 'sourceAmount', 'destinationAmount'],
  });
  const source = accounts.find((account) => account.id === sourceId);
  const destination = accounts.find((account) => account.id === destinationId);
  const sameCurrency = !source || !destination || source.currencyCode === destination.currencyCode;

  useEffect(() => {
    setValue('sameCurrency', sameCurrency);
  }, [sameCurrency, setValue]);

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  // Fields lock while the request is in flight; the short success state keeps them readable (no dimmed page).
  const busy = phase === 'submitting' || remove.isPending;
  const sourceAmount = parseAmount(sourceAmountText ?? '');
  const destinationAmount = parseAmount(destinationAmountText ?? '');
  const rate = !sameCurrency && sourceAmount && destinationAmount ? destinationAmount / sourceAmount : null;

  const submit = () => {
    if (phase !== 'idle') {
      return;
    }
    void handleSubmit(
      async (values) => {
        setServerError(null);
        setPhase('submitting');
        const parsedSource = parseAmount(values.sourceAmount)!;
        const input = {
          sourceAccountId: values.sourceAccountId,
          destinationAccountId: values.destinationAccountId,
          sourceAmount: parsedSource,
          destinationAmount: values.sameCurrency ? parsedSource : parseAmount(values.destinationAmount)!,
          occurredAtUtc: localDateToUtcIso(values.date),
          note: values.note.trim() === '' ? null : values.note.trim(),
        };
        try {
          if (transfer) {
            await update.mutateAsync({ id: transfer.id, input });
          } else {
            // The same id is sent on every retry of this form, so a double tap cannot create two records.
            await create.mutateAsync({ input, clientRequestId: requestId.current() });
            requestId.reset();
          }
          setPhase('success');
          successHaptic();
          // One notification, shown on the destination screen after the success state has been seen.
          doneTimer.current = setTimeout(() => {
            doneTimer.current = null;
            router.back();
            toast({ title: transfer ? 'Dəyişikliklər yadda saxlanıldı' : 'Köçürmə əlavə olundu', tone: 'success' });
          }, SUCCESS_DELAY_MS);
        } catch (error) {
          setPhase('idle');
          setServerError(describeError(error));
        }
      },
      () => setShakeKey((key) => key + 1),
    )();
  };

  const onDelete = async () => {
    if (!transfer) {
      return;
    }
    const confirmed = await confirmAsync('Köçürməni sil', 'Bu köçürmə silinsin? Hər iki hesabın balansı dərhal yenilənəcək.');
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await remove.mutateAsync(transfer.id);
      router.back();
      toast({ title: 'Köçürmə silindi', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const accountRow = (account: Account | undefined, placeholder: string) => ({
    value: account?.name,
    hint: account ? `${accountVisual(account.type).label} · ${account.currencyCode} · ${formatAmount(account.currentBalance, account.currencyCode, false)}` : undefined,
    placeholder,
    icon: account ? accountVisual(account.type).icon : ('wallet-outline' as const),
    iconColor: account ? colors.transfer : undefined,
  });

  const options = (exclude: string | undefined) =>
    accounts.map((account) => ({
      value: account.id,
      label: account.name,
      hint: `${accountVisual(account.type).label} · ${account.currencyCode}`,
      icon: accountVisual(account.type).icon,
      iconColor: colors.transfer,
      disabled: account.id === exclude,
      trailing: <MoneyText variant="meta" color="textSecondary" amount={account.currentBalance} currencyCode={account.currencyCode} showCode={false} />,
    }));

  return (
    <Screen maxWidth={Layout.maxForm} footer={<Button title={transfer ? 'Yadda saxla' : 'Köçür'} onPress={submit} loading={phase === 'submitting'} success={phase === 'success'} successTitle={transfer ? 'Yadda saxlanıldı' : 'Köçürüldü'} icon={transfer ? undefined : 'swap-horizontal-outline'} />}>
      <Entrance style={styles.stack}>
        <ScreenHeader back title={transfer ? 'Köçürmə' : 'Yeni köçürmə'} size="compact" />
        <ServerErrorBanner message={serverError} />

        <View style={[styles.route, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SelectRow {...accountRow(source, 'Mənbə hesabı seçin')} label="Haradan" onPress={() => setSheet('source')} error={formState.errors.sourceAccountId?.message} disabled={busy} />
          <View style={styles.arrowRow}>
            <View style={[styles.arrowLine, { backgroundColor: colors.border }]} />
            <View style={[styles.arrow, { backgroundColor: colors.transferSoft }]}>
              <Ionicons name="arrow-down" size={16} color={colors.transfer} />
            </View>
            <View style={[styles.arrowLine, { backgroundColor: colors.border }]} />
          </View>
          <SelectRow {...accountRow(destination, 'Təyinat hesabı seçin')} label="Haraya" onPress={() => setSheet('destination')} error={formState.errors.destinationAccountId?.message} disabled={busy} />
        </View>

        <Controller
          control={control}
          name="sourceAmount"
          render={({ field: { onChange, onBlur, value } }) => (
            <AmountInput label="Çıxan məbləğ" value={value} onChangeText={onChange} onBlur={onBlur} currencyCode={source?.currencyCode} error={formState.errors.sourceAmount?.message} flow="Transfer" editable={!busy} shakeKey={shakeKey} autoFocus={!transfer} helper={sameCurrency && layout !== 'compact' ? undefined : undefined} />
          )}
        />

        {!sameCurrency ? (
          <Controller
            control={control}
            name="destinationAmount"
            render={({ field: { onChange, onBlur, value } }) => (
              <AmountInput layout="field" label="Daxil olan məbləğ" value={value} onChangeText={onChange} onBlur={onBlur} currencyCode={destination?.currencyCode} error={formState.errors.destinationAmount?.message} flow="Transfer" editable={!busy} helper="Valyutalar fərqlidir: daxil olan məbləği ayrıca yazın." />
            )}
          />
        ) : null}

        {rate && source && destination ? (
          <View style={[styles.rate, { backgroundColor: colors.transferSoft }]} accessibilityLiveRegion="polite">
            <Ionicons name="information-circle-outline" size={16} color={colors.transfer} />
            <AppText variant="caption" color="transfer">
              Məlumat üçün məzənnə: 1 {source.currencyCode} ≈ {rate.toFixed(4)} {destination.currencyCode}
            </AppText>
          </View>
        ) : null}

        <Controller control={control} name="date" render={({ field: { onChange, value } }) => <DateField label="Tarix" value={value} onChange={onChange} error={formState.errors.date?.message} disabled={busy} />} />

        <Controller
          control={control}
          name="note"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Qeyd (istəyə bağlı)" icon="create-outline" value={value} onChangeText={onChange} onBlur={onBlur} error={formState.errors.note?.message} editable={!busy} placeholder="Məsələn, yığıma köçürmə" />
          )}
        />

        {transfer ? (
          <View style={styles.dangerZone}>
            <Button title="Köçürməni sil" variant="danger" icon="trash-outline" onPress={() => void onDelete()} disabled={busy} loading={remove.isPending} />
          </View>
        ) : null}
      </Entrance>

      <SelectionSheet
        visible={sheet === 'source'}
        title="Haradan"
        value={source?.id ?? ''}
        options={options(destination?.id)}
        onSelect={(value) => {
          setValue('sourceAccountId', value, { shouldValidate: true });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
        emptyMessage="Aktiv hesab yoxdur."
      />
      <SelectionSheet
        visible={sheet === 'destination'}
        title="Haraya"
        value={destination?.id ?? ''}
        options={options(source?.id)}
        onSelect={(value) => {
          setValue('destinationAccountId', value, { shouldValidate: true });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
        emptyMessage="Aktiv hesab yoxdur."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.lg,
  },
  route: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.xs,
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  arrowLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  arrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  dangerZone: {
    paddingTop: Spacing.md,
  },
});
