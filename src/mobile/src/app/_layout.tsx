import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BrandMark } from '@/components/brand-mark';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { Entrance } from '@/components/entrance';
import { AppText } from '@/components/text';
import { ToastProvider } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppearanceStore } from '@/lib/appearance-store';
import { queryClient } from '@/lib/query-client';
import { routeGuards } from '@/lib/route-guards';
import { useSessionStore } from '@/lib/session-store';

SplashScreen.preventAutoHideAsync();

/**
 * Root layout: restores the persisted session and the appearance choice behind the native splash and a short
 * brand moment, then exposes exactly one route group. Expo Router's Protected screens redirect automatically
 * when the session status flips.
 */
export default function RootLayout() {
  const theme = useTheme();
  const status = useSessionStore((state) => state.status);
  const restore = useSessionStore((state) => state.restore);
  const appearanceStatus = useAppearanceStore((state) => state.status);
  const restoreAppearance = useAppearanceStore((state) => state.restore);

  useEffect(() => {
    void restore();
    void restoreAppearance();
  }, [restore, restoreAppearance]);

  // The native splash stays up until the stored appearance is known, so the first frame the user sees is
  // already in their palette rather than the OS one flashing for a moment before the choice loads.
  useEffect(() => {
    if (appearanceStatus === 'ready') {
      void SplashScreen.hideAsync();
    }
  }, [appearanceStatus]);

  const navigationTheme = {
    ...(theme.scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      primary: theme.colors.primary,
      background: theme.colors.canvas,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.expense,
    },
  };

  const guards = routeGuards(status);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navigationTheme}>
          <ToastProvider>
            <ConfirmProvider>
              {status === 'loading' || appearanceStatus === 'loading' ? (
                <SessionRestore />
              ) : (
                <Stack screenOptions={{ headerShown: false, animation: theme.reducedMotion ? 'fade' : 'default' }}>
                  <Stack.Protected guard={guards.app}>
                    <Stack.Screen name="(app)" />
                  </Stack.Protected>
                  <Stack.Protected guard={guards.auth}>
                    <Stack.Screen name="(auth)" />
                  </Stack.Protected>
                </Stack>
              )}
              <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** Brand moment while the stored session is read: a scale-in mark, nothing that delays the app. */
function SessionRestore() {
  const { colors } = useTheme();
  return (
    <View style={[styles.restore, { backgroundColor: colors.canvas }]} accessibilityLabel="Libra yüklənir" accessibilityLiveRegion="polite">
      <Entrance from="scale" style={styles.restoreContent}>
        <BrandMark size={64} />
        <AppText variant="heading">Libra</AppText>
      </Entrance>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  restore: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreContent: {
    alignItems: 'center',
    gap: Spacing.lg,
  },
});
