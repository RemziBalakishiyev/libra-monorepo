import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { SelectRow, TextField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { SelectionSheet } from '@/components/selection-sheet';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { currencyOptions, localeOptions, preferenceLabel, timeZoneOptions, withCurrentValue } from '@/constants/preferences';
import { Layout, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useLogout } from '@/hooks/use-auth';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Profile } from '@/lib/api/profile';
import { confirmAsync } from '@/lib/confirm';
import { env } from '@/lib/env';
import { profileSchema, type ProfileForm } from '@/lib/validation/auth';
import { ApiStatusCard } from '@/screens/home/api-status-card';
import { AppearanceSection } from '@/screens/profile/appearance-section';

type SubmitPhase = 'idle' | 'submitting' | 'success';

/** How long the "Yadda saxlanıldı" button state stays before the form is editable again. */
const SUCCESS_FEEDBACK_MS = 1600;

/** Profile: identity, editable preferences with readable selectors, collapsible diagnostics, and sign-out. */
export function ProfileScreen() {
  const profile = useProfile();

  if (profile.isPending) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title="Profil" />
        <FormSkeleton fields={4} label="Profil yüklənir…" />
      </Screen>
    );
  }

  if (profile.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title="Profil" />
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  return <ProfileEditor profile={profile.data} />;
}

/** "remzi" from "remzi@example.com" when no display name is set. */
function localPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

type SheetKind = 'timeZone' | 'locale' | 'currency' | null;

function ProfileEditor({ profile }: { profile: Profile }) {
  const { colors, layout } = useTheme();
  const showToast = useToast();
  const update = useUpdateProfile();
  const logout = useLogout();
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wide = layout === 'wide';

  const { control, handleSubmit, formState, reset, setValue } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: profile.displayName ?? '',
      timeZone: profile.preferences.timeZone,
      locale: profile.preferences.locale,
      currency: profile.preferences.currency,
    },
  });
  const [timeZone, locale, currency] = useWatch({ control, name: ['timeZone', 'locale', 'currency'] });

  useEffect(
    () => () => {
      if (successTimer.current) {
        clearTimeout(successTimer.current);
      }
    },
    [],
  );

  /** Built inside the event handler so nothing runs during render; `phase` guards double submission. */
  const submit = () => {
    if (phase !== 'idle') {
      return;
    }
    void handleSubmit(async (values) => {
      setServerError(null);
      setPhase('submitting');
      try {
        await update.mutateAsync({
          displayName: values.displayName || null,
          preferences: { timeZone: values.timeZone, locale: values.locale, currency: values.currency },
        });
        reset(values);
        setPhase('success');
        showToast({ title: 'Seçimlər yadda saxlanıldı', tone: 'success' });
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        }
        successTimer.current = setTimeout(() => setPhase('idle'), SUCCESS_FEEDBACK_MS);
      } catch (error) {
        setPhase('idle');
        setServerError(describeError(error));
      }
    })();
  };

  const onLogout = async () => {
    const confirmed = await confirmAsync('Çıxış', 'Hesabdan çıxmaq istəyirsiniz?', 'Çıx', false);
    if (confirmed) {
      logout.mutate();
    }
  };

  const busy = phase !== 'idle' || logout.isPending;
  const displayName = profile.displayName?.trim() || localPart(profile.email);
  const timeZones = withCurrentValue(timeZoneOptions, timeZone);
  const locales = withCurrentValue(localeOptions, locale);
  const currencies = withCurrentValue(currencyOptions, currency);

  const identity = (
    <View style={styles.identity}>
      <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="person" size={28} color={colors.primary} />
      </View>
      <View style={styles.identityText}>
        <AppText variant="heading" numberOfLines={2}>
          {displayName}
        </AppText>
        <AppText variant="meta" color="textSecondary" numberOfLines={1}>
          {profile.email}
        </AppText>
      </View>
    </View>
  );

  const form = (
    <View style={styles.section}>
      <SectionHeader title="Seçimlər" />
      {serverError ? (
        <View style={[styles.alert, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <AppText variant="meta" color="error" style={styles.flex}>
            {serverError}
          </AppText>
        </View>
      ) : null}
      <Controller
        control={control}
        name="displayName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Ad" icon="person-outline" value={value} onChangeText={onChange} onBlur={onBlur} error={formState.errors.displayName?.message} hint="Salamlaşmada və profildə göstərilir" autoComplete="name" textContentType="name" editable={!busy} returnKeyType="done" onSubmitEditing={submit} />
        )}
      />
      <SelectRow label="Dil" icon="language-outline" value={preferenceLabel(locales, locale)} placeholder="Dil seçin" onPress={() => setSheet('locale')} error={formState.errors.locale?.message} disabled={busy} hint={locale} />
      <SelectRow label="Valyuta" icon="cash-outline" value={preferenceLabel(currencies, currency)} placeholder="Valyuta seçin" onPress={() => setSheet('currency')} error={formState.errors.currency?.message} disabled={busy} hint="Yeni hesablar üçün standart valyuta" />
      <SelectRow label="Saat qurşağı" icon="time-outline" value={preferenceLabel(timeZones, timeZone)} placeholder="Saat qurşağı seçin" onPress={() => setSheet('timeZone')} error={formState.errors.timeZone?.message} disabled={busy} hint="Günlər və aylar bu saat qurşağına görə hesablanır" />
    </View>
  );

  const diagnostics = (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: diagnosticsOpen }}
        accessibilityLabel="Diaqnostika"
        accessibilityHint="API ünvanını və texniki vəziyyəti göstərir"
        onPress={() => setDiagnosticsOpen((value) => !value)}
        style={({ pressed }) => [styles.disclosure, { backgroundColor: pressed ? colors.surfaceInteractive : colors.surfaceSubtle }]}
        testID="profile-diagnostics">
        <Ionicons name="hardware-chip-outline" size={18} color={colors.textSecondary} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">Diaqnostika</AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            API ünvanı və texniki vəziyyət
          </AppText>
        </View>
        <Ionicons name={diagnosticsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {diagnosticsOpen ? (
        <Entrance from="fade" style={styles.section}>
          <View style={[styles.urlRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="caption" color="textMuted">
              API ünvanı
            </AppText>
            <AppText variant="meta" selectable numberOfLines={2} style={styles.mono}>
              {env.EXPO_PUBLIC_API_URL}
            </AppText>
          </View>
          <ApiStatusCard />
        </Entrance>
      ) : null}
    </View>
  );

  const signOut = (
    <View style={styles.section}>
      <Button title="Çıxış" variant="danger" icon="log-out-outline" onPress={() => void onLogout()} loading={logout.isPending} disabled={phase !== 'idle'} accessibilityHint="Hesabdan çıxmadan əvvəl təsdiq soruşulur" />
    </View>
  );

  return (
    <Screen
      maxWidth={wide ? Layout.maxFormWide : Layout.maxForm}
      footer={
        <View style={wide ? styles.footerWide : null}>
          <Button title="Yadda saxla" onPress={submit} loading={phase === 'submitting'} success={phase === 'success'} successTitle="Yadda saxlanıldı" disabled={logout.isPending || !formState.isDirty} style={wide ? styles.footerButtonWide : null} testID="profile-save" />
        </View>
      }>
      <Entrance index={0} style={styles.header}>
        <ScreenHeader back title="Profil" />
        {identity}
      </Entrance>

      {wide ? (
        <View style={styles.columns}>
          <Entrance index={1} style={styles.columnMain}>
            {form}
          </Entrance>
          <View style={styles.columnSide}>
            <Entrance index={2}>
              <AppearanceSection />
            </Entrance>
            <Entrance index={3}>{diagnostics}</Entrance>
            <Entrance index={4}>{signOut}</Entrance>
          </View>
        </View>
      ) : (
        <>
          <Entrance index={1}>{form}</Entrance>
          <Entrance index={2}>
            <AppearanceSection />
          </Entrance>
          <Entrance index={3}>{diagnostics}</Entrance>
          <Entrance index={4}>{signOut}</Entrance>
        </>
      )}

      <SelectionSheet
        visible={sheet === 'locale'}
        title="Dil"
        options={locales.map((option) => ({ value: option.value, label: option.label, hint: option.hint, icon: 'language-outline' as const }))}
        value={locale}
        onSelect={(value) => {
          setValue('locale', value, { shouldDirty: true, shouldValidate: true });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <SelectionSheet
        visible={sheet === 'currency'}
        title="Valyuta"
        options={currencies.map((option) => ({ value: option.value, label: option.label, hint: option.hint, icon: 'cash-outline' as const }))}
        value={currency}
        onSelect={(value) => {
          setValue('currency', value, { shouldDirty: true, shouldValidate: true });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <SelectionSheet
        visible={sheet === 'timeZone'}
        title="Saat qurşağı"
        options={timeZones.map((option) => ({ value: option.value, label: option.label, hint: option.hint, icon: 'time-outline' as const }))}
        value={timeZone}
        onSelect={(value) => {
          setValue('timeZone', value, { shouldDirty: true, shouldValidate: true });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    gap: Spacing.xl,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    gap: Spacing.xxs,
  },
  section: {
    gap: Spacing.md,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  urlRow: {
    gap: Spacing.xxs,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  mono: {
    fontVariant: ['tabular-nums'],
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxl,
  },
  columnMain: {
    flex: 3,
    minWidth: 0,
  },
  columnSide: {
    flex: 2,
    minWidth: 0,
    gap: Spacing.section,
  },
  footerWide: {
    alignItems: 'flex-start',
  },
  footerButtonWide: {
    minWidth: 240,
  },
});
