import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Sidebar } from '@/components/sidebar';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { setDisplayLocale } from '@/lib/money';

/**
 * Signed-in group. Native headers are off: every screen renders its own `ScreenHeader` so the look is identical
 * on iOS, Android, and web. Wide layouts (desktop web) get a persistent left sidebar next to the stack.
 */
export default function AppLayout() {
  const { layout, colors, reducedMotion } = useTheme();
  const profile = useProfile();
  const locale = profile.data?.preferences.locale;

  // One display locale for every number on screen; the profile preference wins over the az-AZ default.
  useEffect(() => {
    setDisplayLocale(locale);
  }, [locale]);

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
