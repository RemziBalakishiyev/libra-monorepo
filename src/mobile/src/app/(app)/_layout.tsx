import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Sidebar } from '@/components/sidebar';
import { useProfile } from '@/hooks/use-profile';
import { useSleepReminderTaps } from '@/hooks/use-sleep-reminder-taps';
import { useTheme } from '@/hooks/use-theme';
import { setProfileTimeZone } from '@/lib/dates';
import { UI_LOCALE, setDisplayLocale } from '@/lib/money';

/**
 * Signed-in group. Native headers are off: every screen renders its own `ScreenHeader` so the look is identical
 * on iOS, Android, and web. Wide layouts (desktop web) get a persistent left sidebar next to the stack.
 */
export default function AppLayout() {
  const { layout, colors, reducedMotion } = useTheme();
  const profile = useProfile();
  const timeZone = profile.data?.preferences.timeZone;

  // A tapped wake-up reminder opens the sleep screen. It never records waking on the user's behalf.
  useSleepReminderTaps();

  // One display convention for every number on screen: the interface language (az-AZ), so "5.000,00 AZN" reads
  // the same on the dashboard, in rows and next to the entry field's "0,00". The stored "Dil" preference is kept
  // for a localised interface; it no longer switches digit separators on its own.
  useEffect(() => {
    setDisplayLocale(UI_LOCALE);
  }, []);

  // Date-only pickers resolve "today" in the profile time zone.
  useEffect(() => {
    setProfileTimeZone(timeZone);
  }, [timeZone]);

  const stack = (
    <Stack screenOptions={{ headerShown: false, animation: reducedMotion ? 'fade' : 'default', contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile" options={{ title: 'Profil' }} />
      <Stack.Screen name="quick-add" options={{ title: 'Tez əlavə et', presentation: 'modal' }} />
      <Stack.Screen name="finance/setup" options={{ title: 'Maliyyə quraşdırması' }} />
      <Stack.Screen name="finance/transactions/index" options={{ title: 'Əməliyyatlar' }} />
      <Stack.Screen name="finance/transactions/new" options={{ title: 'Yeni əməliyyat' }} />
      <Stack.Screen name="finance/transactions/[id]" options={{ title: 'Əməliyyat' }} />
      <Stack.Screen name="finance/accounts/index" options={{ title: 'Hesablar' }} />
      <Stack.Screen name="finance/accounts/new" options={{ title: 'Yeni hesab' }} />
      <Stack.Screen name="finance/accounts/[id]" options={{ title: 'Hesab' }} />
      <Stack.Screen name="finance/transfers/index" options={{ title: 'Köçürmələr' }} />
      <Stack.Screen name="finance/transfers/new" options={{ title: 'Yeni köçürmə' }} />
      <Stack.Screen name="finance/transfers/[id]" options={{ title: 'Köçürmə' }} />
      <Stack.Screen name="finance/budgets/index" options={{ title: 'Büdcələr' }} />
      <Stack.Screen name="finance/budgets/new" options={{ title: 'Yeni büdcə' }} />
      <Stack.Screen name="finance/budgets/[id]" options={{ title: 'Büdcə' }} />
      <Stack.Screen name="finance/categories/index" options={{ title: 'Kateqoriyalar' }} />
      <Stack.Screen name="finance/categories/new" options={{ title: 'Yeni kateqoriya' }} />
      <Stack.Screen name="finance/categories/[id]" options={{ title: 'Kateqoriya' }} />
      <Stack.Screen name="finance/recurring/index" options={{ title: 'Təkrarlananlar' }} />
      <Stack.Screen name="finance/recurring/new" options={{ title: 'Yeni təkrarlanan' }} />
      <Stack.Screen name="finance/recurring/[id]" options={{ title: 'Şablona düzəliş' }} />
      <Stack.Screen name="finance/debts/index" options={{ title: 'Borclar' }} />
      <Stack.Screen name="finance/debts/new" options={{ title: 'Yeni borc' }} />
      <Stack.Screen name="finance/debts/[id]/index" options={{ title: 'Borc' }} />
      <Stack.Screen name="finance/debts/[id]/edit" options={{ title: 'Borca düzəliş' }} />
      <Stack.Screen name="nutrition/new" options={{ title: 'Yeni yemək' }} />
      <Stack.Screen name="nutrition/photo" options={{ title: 'Şəkildən əlavə et' }} />
      <Stack.Screen name="nutrition/[id]" options={{ title: 'Yemək' }} />
      <Stack.Screen name="nutrition/goals" options={{ title: 'Qidalanma hədəfləri' }} />
      <Stack.Screen name="plan/new" options={{ title: 'Yeni tapşırıq' }} />
      <Stack.Screen name="plan/[id]" options={{ title: 'Tapşırıq' }} />
      <Stack.Screen name="sleep/index" options={{ title: 'Yuxu' }} />
      <Stack.Screen name="sleep/new" options={{ title: 'Yuxu əlavə et' }} />
      <Stack.Screen name="sleep/[id]" options={{ title: 'Yuxuya düzəliş' }} />
    </Stack>
  );

  if (layout !== 'wide') {
    return stack;
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.canvas }]}>
      <Sidebar />
      <View style={styles.content}>{stack}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
});
