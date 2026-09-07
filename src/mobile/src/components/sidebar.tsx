import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import type { QuickActionKind } from '@/components/quick-action';
import { QuickAddMenu } from '@/components/quick-add-menu';
import { AppText } from '@/components/text';
import { tabs } from '@/constants/tabs';
import { Layout, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useLogout } from '@/hooks/use-auth';
import { useAccounts } from '@/hooks/use-finance';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { quickActionHref } from '@/lib/quick-add';

const tabHrefs: Record<string, string> = { index: '/', finance: '/finance', nutrition: '/nutrition', plan: '/plan', ai: '/ai' };

/** Desktop navigation: brand, the five destinations, Quick Add, and profile/sign-out. */
export function Sidebar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const profile = useProfile();
  const logout = useLogout();
  const accounts = useAccounts();
  const [menuOpen, setMenuOpen] = useState(false);
  const canQuickAdd = (accounts.data?.length ?? 0) > 0;

  const isActive = (name: string) => {
    const href = tabHrefs[name] ?? '/';
    if (href === '/') {
      return pathname === '/' || pathname === '/index';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const select = (kind: QuickActionKind) => {
    setMenuOpen(false);
    router.push(quickActionHref(kind));
  };

  return (
    <View style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border, paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl }]} accessibilityRole="menu" accessibilityLabel="Naviqasiya">
      <View style={styles.brand}>
        <BrandMark size={36} wordmark />
      </View>

      {canQuickAdd ? <Button title="Tez əlavə et" icon="add" onPress={() => setMenuOpen(true)} style={styles.quickAdd} /> : null}

      <View style={styles.nav} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const active = isActive(tab.name);
          return (
            <PressableScale
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.title}
              onPress={() => router.navigate(tabHrefs[tab.name] as never)}
              scaleTo={0.985}
              containerStyle={styles.full}
              pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
              style={[styles.item, { backgroundColor: active ? colors.primarySoft : 'transparent' }]}>
              <Ionicons name={active ? tab.activeIcon : tab.icon} size={22} color={active ? colors.primaryText : colors.textSecondary} />
              <AppText variant={active ? 'bodyStrong' : 'body'} style={{ color: active ? colors.primaryText : colors.textPrimary }} numberOfLines={1}>
                {tab.title}
              </AppText>
              {tab.placeholder ? (
                <AppText variant="caption" color="textMuted" style={styles.badge}>
                  Tezliklə
                </AppText>
              ) : null}
            </PressableScale>
          );
        })}
      </View>

      <View style={styles.footer}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Profil və seçimlər"
          onPress={() => router.push('/profile')}
          scaleTo={0.985}
          containerStyle={styles.full}
          pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
          style={[styles.profile, { backgroundColor: colors.surfaceSubtle }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="person-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.profileText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {profile.data?.displayName ?? 'Profil'}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {profile.data?.email ?? 'Seçimlər'}
            </AppText>
          </View>
          <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
        </PressableScale>
        <Button title="Çıxış" variant="ghost" size="sm" icon="log-out-outline" onPress={() => logout.mutate()} loading={logout.isPending} />
      </View>

      <QuickAddMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onSelect={select} origin="sidebar" />
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: Layout.sidebarWidth,
    paddingHorizontal: Spacing.lg,
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xl,
  },
  brand: {
    paddingHorizontal: Spacing.sm,
  },
  quickAdd: {
    width: '100%',
  },
  nav: {
    gap: Spacing.xxs,
  },
  full: {
    width: '100%',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget - 4,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  badge: {
    marginLeft: 'auto',
  },
  footer: {
    marginTop: 'auto',
    gap: Spacing.sm,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    gap: 1,
  },
});
