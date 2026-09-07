import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Entrance } from '@/components/entrance';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/color';

type PlaceholderScreenProps = {
  title: string;
  description: string;
  icon: IconName;
  /** Module accent token, e.g. `moduleNutrition`. */
  accent?: Extract<ThemeColor, 'moduleNutrition' | 'modulePlan' | 'moduleSleep' | 'moduleAi' | 'moduleFinance'>;
  /** Short list of what the module will cover, rendered as calm rows (no data, no actions). */
  upcoming?: string[];
};

/**
 * "Tezliklə" tab. Deliberately contains no data and no actions so nothing looks functional before it is.
 * The composition (accent, rings, icon, upcoming list) is the visual foundation the real module will adopt.
 */
export function PlaceholderScreen({ title, description, icon, accent = 'modulePlan', upcoming = [] }: PlaceholderScreenProps) {
  const { colors, scheme } = useTheme();
  const tint = colors[accent];

  return (
    <Screen tabInset>
      <Entrance style={styles.stack}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        <View style={styles.illustration}>
          <View style={[styles.ringOuter, { borderColor: withAlpha(tint, scheme === 'dark' ? 0.35 : 0.25) }]} />
          <View style={[styles.ringMiddle, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.16 : 0.1) }]} />
          <View style={[styles.iconTile, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.28 : 0.16) }]}>
            <Ionicons name={icon} size={30} color={tint} accessibilityElementsHidden />
          </View>
          <View style={[styles.dotA, { backgroundColor: tint }]} />
          <View style={[styles.dotB, { backgroundColor: withAlpha(tint, 0.5) }]} />
        </View>
        <View style={styles.copy}>
          <View style={[styles.chip, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.22 : 0.12) }]}>
            <AppText variant="caption" style={{ color: tint }}>
              Tezliklə
            </AppText>
          </View>
          <AppText color="textSecondary" align="center" style={styles.description}>
            {description}
          </AppText>
        </View>
        {upcoming.length > 0 ? (
          <View style={[styles.upcoming, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {upcoming.map((item, index) => (
              <View key={item} style={[styles.upcomingRow, index < upcoming.length - 1 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null]}>
                <View style={[styles.upcomingDot, { backgroundColor: tint }]} />
                <AppText variant="meta" color="textSecondary">
                  {item}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
      </Entrance>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.xxl,
  },
  illustration: {
    alignSelf: 'center',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  ringOuter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ringMiddle: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  iconTile: {
    width: 76,
    height: 76,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotA: {
    position: 'absolute',
    top: 28,
    right: 30,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotB: {
    position: 'absolute',
    bottom: 36,
    left: 26,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  copy: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  description: {
    maxWidth: 360,
  },
  upcoming: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 44,
  },
  upcomingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
