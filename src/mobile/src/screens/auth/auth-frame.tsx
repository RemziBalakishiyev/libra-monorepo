import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { Entrance } from '@/components/entrance';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/text';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AuthFrameProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

/**
 * Shared frame for login and registration: brand mark, one-line value statement, a subtle background wash, and
 * a focused white form card centred at a readable width on every screen size. Fields sit 12 units apart and
 * validation grows the card naturally instead of reserving empty rows.
 */
export function AuthFrame({ title, subtitle, children }: AuthFrameProps) {
  const { colors, shadows, layout } = useTheme();

  return (
    <Screen maxWidth={Layout.maxForm} contentStyle={styles.content}>
      <View style={[styles.washLarge, { backgroundColor: colors.primarySoft }]} />
      <View style={[styles.washSmall, { backgroundColor: colors.incomeSoft }]} />
      <Entrance from="scale" style={styles.brand}>
        <BrandMark size={52} wordmark />
        <AppText variant="body" color="textSecondary" align={layout === 'compact' ? 'left' : 'center'} style={styles.tagline}>
          Maliyyə, qidalanma, yuxu və planlar — hamısı bir sakit tətbiqdə.
        </AppText>
      </Entrance>
      <Entrance index={1} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.raised }]}>
        <View style={styles.heading}>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          <AppText color="textSecondary">{subtitle}</AppText>
        </View>
        {children}
      </Entrance>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.xxl,
    paddingTop: Spacing.lg,
  },
  washLarge: {
    position: 'absolute',
    top: -160,
    right: -140,
    width: 360,
    height: 360,
    borderRadius: 180,
    opacity: 0.9,
  },
  washSmall: {
    position: 'absolute',
    top: 120,
    left: -120,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.8,
  },
  brand: {
    gap: Spacing.md,
  },
  tagline: {
    maxWidth: 420,
  },
  card: {
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.md,
  },
  heading: {
    gap: Spacing.xxs,
    marginBottom: Spacing.xs,
  },
});
