import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BrandMarkProps = {
  size?: number;
  /** Renders the wordmark next to the mark. */
  wordmark?: boolean;
  /** Use on the indigo hero: translucent white tile instead of indigo. */
  onHero?: boolean;
};

/**
 * Code-native Libra mark: a balance — beam, post, base, two hanging pans — inside a rounded indigo tile.
 * No raster asset is supplied yet, so the mark is drawn with views and scales with `size`.
 */
export function BrandMark({ size = 40, wordmark = false, onHero = false }: BrandMarkProps) {
  const { colors } = useTheme();
  const u = size / 40;
  const tile = onHero ? 'rgba(255,255,255,0.16)' : colors.primary;
  const ink = '#FFFFFF';

  return (
    <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel="Libra">
      <View style={[styles.tile, { width: size, height: size, borderRadius: Radius.md * u, backgroundColor: tile, experimental_backgroundImage: onHero ? undefined : `linear-gradient(150deg, ${colors.heroGradientEnd}, ${colors.primary})` }]}>
        {/* beam */}
        <View style={[styles.abs, { left: 8 * u, top: 11 * u, width: 24 * u, height: 2.4 * u, borderRadius: 2 * u, backgroundColor: ink }]} />
        {/* post and base */}
        <View style={[styles.abs, { left: 18.8 * u, top: 8 * u, width: 2.4 * u, height: 21 * u, borderRadius: 2 * u, backgroundColor: ink }]} />
        <View style={[styles.abs, { left: 14 * u, top: 28.5 * u, width: 12 * u, height: 2.4 * u, borderRadius: 2 * u, backgroundColor: ink }]} />
        {/* strings */}
        <View style={[styles.abs, { left: 9.6 * u, top: 13 * u, width: 1.4 * u, height: 6 * u, backgroundColor: ink, opacity: 0.85 }]} />
        <View style={[styles.abs, { left: 29 * u, top: 13 * u, width: 1.4 * u, height: 6 * u, backgroundColor: ink, opacity: 0.85 }]} />
        {/* pans */}
        <View style={[styles.abs, { left: 5.5 * u, top: 19 * u, width: 9.6 * u, height: 4 * u, backgroundColor: ink, borderBottomLeftRadius: 5 * u, borderBottomRightRadius: 5 * u }]} />
        <View style={[styles.abs, { left: 24.9 * u, top: 19 * u, width: 9.6 * u, height: 4 * u, backgroundColor: ink, borderBottomLeftRadius: 5 * u, borderBottomRightRadius: 5 * u }]} />
      </View>
      {wordmark ? (
        <AppText variant="heading" color={onHero ? 'onHero' : 'textPrimary'} style={{ fontSize: size * 0.6, lineHeight: size * 0.75, letterSpacing: -0.4 }}>
          Libra
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  tile: {
    overflow: 'hidden',
  },
  abs: {
    position: 'absolute',
  },
});
