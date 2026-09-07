import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Platform, StyleSheet, View } from 'react-native';

import { AccountItem } from '@/components/account-item';
import { Button } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { FieldGroup, SelectRow, SwitchRow, TextField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SelectionSheet, type SelectionOption } from '@/components/selection-sheet';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { useToast } from '@/components/toast';
import { accountVisual } from '@/constants/categories';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useAccount, useCreateAccount, useDeleteAccount, useFinanceSetup, useUpdateAccount } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import { accountTypeSchema, type Account, type AccountType } from '@/lib/api/finance';
import { confirmAsync } from '@/lib/confirm';
import { useMotion } from '@/lib/motion';
import { accountFormSchema, parseSignedAmount, type AccountForm } from '@/lib/validation/finance';

/** Account types with the shared icon family; labels come from `accountVisual` so lists and the form agree. */
export const accountTypeOptions: readonly SelectionOption<AccountType>[] = accountTypeSchema.options.map((value) => ({
  value,
  label: accountVisual(value).label,
  icon: accountVisual(value).icon,
}));

const LOCKED_REASON = 'Hesabda əməliyyat olduğu üçün dəyişdirilə bilməz';
const SETUP_INTRO = 'Pulunuzun saxlandığı ilk yeri əlavə edin. Başlanğıc balansı hazırkı real qalığınızdır. Digər hesabları sonra da əlavə edə bilərsiniz.';
const HAS_ACTIVITY_NOTE = 'Bu hesabın əməliyyatları var; silmək əvəzinə arxivləyin.';
/** Lets the success state of the button register before the screen leaves. */
const SUCCESS_DELAY_MS = 600;

type AccountFormScreenProps = {
  /** Existing account to edit; omit to create. */
  id?: string;
  /** Finance onboarding: creates the first account through the setup endpoint. */
  mode?: 'create' | 'setup';
};

export function AccountFormScreen({ id, mode = 'create' }: AccountFormScreenProps) {
  const existing = useAccount(id);
  const { layout } = useTheme();
  const maxWidth = layout === 'wide' ? Layout.maxFormWide : Layout.maxForm;

  if (id && existing.isPending) {
    return (
      <Screen maxWidth={maxWidth}>
        <ScreenHeader back title="Hesab" />
        <FormSkeleton fields={5} label="Hesab yüklənir…" />
      </Screen>
    );
  }

  if (id && existing.isError) {
    return (
      <Screen maxWidth={maxWidth}>
        <ScreenHeader back title="Hesab" />
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }

  return <AccountEditor account={existing.data} mode={mode} />;
}

type Phase = 'idle' | 'submitting' | 'saved' | 'deleting' | 'deleted';

const copy = {
  setup: { title: 'Maliyyə quraşdırması', submit: 'Maliyyəni quraşdır', done: 'Quraşdırıldı', toast: 'Maliyyə quraşdırıldı' },
  create: { title: 'Yeni hesab', submit: 'Hesab yarat', done: 'Yaradıldı', toast: 'Hesab yaradıldı' },
  edit: { title: '', submit: 'Yadda saxla', done: 'Yadda saxlanıldı', toast: 'Dəyişikliklər yadda saxlanıldı' },
} as const;

function AccountEditor({ account, mode }: { account: Account | undefined; mode: 'create' | 'setup' }) {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const toast = useToast();
  const create = useCreateAccount();
  const setup = useFinanceSetup();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [phase, setPhase] = useState<Phase>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isArchived, setIsArchived] = useState(account?.isArchived ?? false);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const isEdit = account !== undefined;
  const locked = account?.hasActivity ?? false;
  const variant = isEdit ? 'edit' : mode;
  const text = copy[variant];
  const wide = layout === 'wide';
  const busy = phase !== 'idle';
  const [pendingToast, setPendingToast] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<AccountForm>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: account?.name ?? '',
      type: account?.type ?? 'Cash',
      currencyCode: account?.currencyCode ?? 'AZN',
      openingBalance: account ? String(account.openingBalance) : '',
      isIncludedInTotal: account?.isIncludedInTotal ?? true,
    },
  });
  const values = useWatch({ control });
  const currencyCode = (values.currencyCode ?? '').toUpperCase();

  // Navigates once the success state has been visible for a moment; unmounting clears the timer. The one
  // notification is shown on the destination screen, never over this form's title.
  useEffect(() => {
    if (phase !== 'saved' && phase !== 'deleted') {
      return;
    }
    const timer = setTimeout(() => {
      if (phase === 'saved' && mode === 'setup' && !isEdit) {
        router.replace('/finance');
      } else {
        router.back();
      }
      if (pendingToast) {
        toast({ title: pendingToast, tone: 'success' });
      }
    }, SUCCESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, mode, isEdit, router, toast, pendingToast]);

  const celebrate = (title: string) => {
    setPendingToast(title);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const submit = handleSubmit(async (form) => {
    if (busy) {
      return;
    }
    setServerError(null);
    setPhase('submitting');
    const input = {
      name: form.name,
      type: form.type,
      currencyCode: form.currencyCode,
      openingBalance: parseSignedAmount(form.openingBalance),
      isIncludedInTotal: form.isIncludedInTotal,
    };
    try {
      if (account) {
        await update.mutateAsync({ id: account.id, input: { ...input, isArchived } });
      } else if (mode === 'setup') {
        await setup.mutateAsync(input);
      } else {
        await create.mutateAsync(input);
      }
      celebrate(text.toast);
      setPhase('saved');
    } catch (error) {
      setServerError(describeError(error));
      setPhase('idle');
    }
  });

  const onDelete = async () => {
    if (!account || busy) {
      return;
    }
    const confirmed = await confirmAsync('Hesabı sil', `"${account.name}" hesabı silinsin? Bu əməliyyat geri qaytarıla bilməz.`);
    if (!confirmed) {
      return;
    }
    setServerError(null);
    setPhase('deleting');
    try {
      await remove.mutateAsync(account.id);
      celebrate('Hesab silindi');
      setPhase('deleted');
    } catch (error) {
      setServerError(describeError(error));
      setPhase('idle');
    }
  };

  const fields = (
    <View style={styles.fields}>
      <Entrance index={mode === 'setup' ? 2 : 1} style={styles.section}>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Hesab adı" value={value} onChangeText={onChange} onBlur={onBlur} placeholder="məs. Kapital kart" error={formState.errors.name?.message} editable={!busy} autoCorrect={false} returnKeyType="next" />
          )}
        />
        <Controller
          control={control}
          name="type"
          render={({ field: { onChange, value } }) => (
            <>
              <SelectRow label="Növ" value={accountVisual(value).label} placeholder="Hesab növünü seçin" icon={accountVisual(value).icon} iconColor={colors.primary} onPress={() => setTypeSheetOpen(true)} disabled={busy} error={formState.errors.type?.message} />
              <SelectionSheet
                visible={typeSheetOpen}
                title="Hesab növü"
                options={accountTypeOptions}
                value={value}
                onSelect={(next) => {
                  onChange(next);
                  setTypeSheetOpen(false);
                }}
                onClose={() => setTypeSheetOpen(false)}
              />
            </>
          )}
        />
      </Entrance>

      <Entrance index={mode === 'setup' ? 3 : 2} style={styles.section}>
        <Controller
          control={control}
          name="currencyCode"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Valyuta"
              value={value}
              onChangeText={(next: string) => onChange(next.toUpperCase())}
              onBlur={onBlur}
              error={formState.errors.currencyCode?.message}
              hint={locked ? LOCKED_REASON : 'ISO 4217, məs. AZN'}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={3}
              editable={!busy && !locked}
              trailing={locked ? <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} accessibilityLabel={LOCKED_REASON} /> : undefined}
            />
          )}
        />
        <Controller
          control={control}
          name="openingBalance"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Başlanğıc balans"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={formState.errors.openingBalance?.message}
              hint={locked ? LOCKED_REASON : 'Hazırkı real qalıq. Mənfi dəyər üçün əvvəlinə "-" qoyun, məs. -120,50'}
              keyboardType="numbers-and-punctuation"
              placeholder="0"
              editable={!busy && !locked}
              style={styles.tabular}
              trailing={
                locked ? (
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} accessibilityLabel={LOCKED_REASON} />
                ) : currencyCode ? (
                  <AppText variant="meta" color="textMuted">
                    {currencyCode}
                  </AppText>
                ) : undefined
              }
            />
          )}
        />
      </Entrance>

      <Entrance index={mode === 'setup' ? 4 : 3} style={styles.section}>
        <Controller
          control={control}
          name="isIncludedInTotal"
          render={({ field: { onChange, value } }) => <SwitchRow label="Cəmə daxil et" description="Ümumi balans hesablanarkən bu hesab nəzərə alınır." value={value} onChange={onChange} disabled={busy} />}
        />
        {isEdit ? <SwitchRow label="Arxivlə" description="Arxivdəki hesab yeni əməliyyat qəbul etmir, tarixçədə qalır." value={isArchived} onChange={setIsArchived} disabled={busy} /> : null}
      </Entrance>

      {account ? (
        <Entrance index={4} style={styles.section}>
          {account.hasActivity ? (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
              <AppText variant="caption" color="textSecondary" style={styles.flex}>
                {HAS_ACTIVITY_NOTE}
              </AppText>
            </View>
          ) : (
            <Button title="Hesabı sil" variant="danger" icon="trash-outline" onPress={() => void onDelete()} loading={phase === 'deleting'} success={phase === 'deleted'} successTitle="Silindi" disabled={busy} accessibilityHint="Təsdiq soruşur" />
          )}
        </Entrance>
      ) : null}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {serverError ? <ServerError message={serverError} /> : null}
      <Button title={text.submit} onPress={() => void submit()} loading={phase === 'submitting'} success={phase === 'saved'} successTitle={text.done} disabled={busy} style={wide ? styles.footerButtonWide : undefined} testID="account-submit" />
    </View>
  );

  return (
    <Screen maxWidth={wide ? Layout.maxFormWide : Layout.maxForm} footer={footer} testID="account-form">
      <Entrance index={0}>
        <ScreenHeader back title={isEdit ? account.name : text.title} subtitle={isEdit ? `${accountVisual(account.type).label} · ${formatAmount(account.currentBalance, account.currencyCode)}` : undefined} />
      </Entrance>
      {mode === 'setup' && !isEdit ? (
        <Entrance index={1}>
          <AppText color="textSecondary">{SETUP_INTRO}</AppText>
        </Entrance>
      ) : null}
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.formColumn}>{fields}</View>
          <Entrance index={2} style={styles.summaryColumn}>
            <AccountPreview values={values} currencyCode={currencyCode} account={account} isArchived={isArchived} />
          </Entrance>
        </View>
      ) : (
        fields
      )}
    </Screen>
  );
}

/** Server-side failure shown next to the action it belongs to. */
function ServerError({ message }: { message: string }) {
  const { colors } = useTheme();
  const motion = useMotion();
  return (
    <Entrance exiting={motion.exit()} accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: colors.errorSoft }]}>
      <Ionicons name="alert-circle" size={18} color={colors.error} />
      <AppText variant="meta" color="error" style={styles.flex}>
        {message}
      </AppText>
    </Entrance>
  );
}

type AccountPreviewProps = {
  values: Partial<AccountForm>;
  currencyCode: string;
  account: Account | undefined;
  isArchived: boolean;
};

/** Desktop companion column: the account row as it will appear in lists, built from the live form values. */
function AccountPreview({ values, currencyCode, account, isArchived }: AccountPreviewProps) {
  const { colors } = useTheme();
  const code = currencyCode || account?.currencyCode || '—';
  const openingBalance = parseSignedAmount(values.openingBalance ?? '');
  const balance = account ? account.currentBalance - account.openingBalance + openingBalance : openingBalance;

  return (
    <View style={styles.preview}>
      <AppText variant="meta" color="textSecondary">
        Siyahıda belə görünəcək
      </AppText>
      <FieldGroup style={styles.previewSurface}>
        <AccountItem
          account={{
            id: account?.id ?? 'preview',
            name: values.name?.trim() || 'Hesab adı',
            type: values.type ?? 'Cash',
            currencyCode: code,
            balance,
            isIncludedInTotal: values.isIncludedInTotal ?? true,
            isArchived,
          }}
          isLast
          onSurface
        />
      </FieldGroup>
      {account ? (
        <View style={styles.previewRows}>
          <PreviewRow label="Başlanğıc balans" amount={openingBalance} currencyCode={code} />
          <PreviewRow label="Cari balans" amount={balance} currencyCode={code} />
          {account.hasActivity ? (
            <View style={styles.note}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              <AppText variant="caption" color="textSecondary" style={styles.flex}>
                Valyuta və başlanğıc balans kilidlidir: {LOCKED_REASON.toLowerCase()}.
              </AppText>
            </View>
          ) : null}
        </View>
      ) : (
        <AppText variant="caption" color="textSecondary">
          Cəmə daxil olan hesablar ümumi balansı formalaşdırır; digərləri yalnız siyahıda görünür.
        </AppText>
      )}
    </View>
  );
}

function PreviewRow({ label, amount, currencyCode }: { label: string; amount: number; currencyCode: string }) {
  return (
    <View style={styles.previewRow}>
      <AppText variant="meta" color="textSecondary">
        {label}
      </AppText>
      <MoneyText amount={amount} currencyCode={currencyCode} variant="bodyStrong" highlightNegative />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  fields: {
    gap: Spacing.section,
  },
  section: {
    gap: Spacing.md,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  footer: {
    gap: Spacing.md,
  },
  footerButtonWide: {
    alignSelf: 'flex-start',
    minWidth: 280,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.huge,
  },
  formColumn: {
    flex: 1,
    maxWidth: Layout.maxForm,
  },
  summaryColumn: {
    width: 320,
    gap: Spacing.md,
  },
  preview: {
    gap: Spacing.md,
  },
  previewSurface: {
    paddingHorizontal: Spacing.lg,
  },
  previewRows: {
    gap: Spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
});
