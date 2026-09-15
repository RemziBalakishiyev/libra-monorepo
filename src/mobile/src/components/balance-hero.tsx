import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AnimatedNumber } from '@/components/animated-number';
import { Entrance } from '@/components/entrance';
import { AppText, formatAmount } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRovingRadioGroup } from '@/lib/a11y';

type BalanceHeroProps = {
  totalBalance: number;
  currencyCode: string;
  availableCurrencies: string[];
  onCurrencyChange?: (code: string) => void;
  otherCurrencies: { currencyCode: string; totalBalance: number; accountCount: number }[];
  negativeAccounts: { name: string }[];
  /** Small line under the label, e.g. the month. */
  caption?: string;
  /** Rendered at the top-right (header actions on the hero). */
  trailing?: ReactNode;
};

/**
 * The one deep-indigo brand moment: current account balance on a restrained gradient with a code-native orbit
 * texture. Around 150 logical units tall with normal text; grows with larger text. Currency is a chip row;
 * other currencies are listed separately and never summed (D-027).
 */
export function BalanceHero({ totalBalance, currencyCode, availableCurrencies, onCurrencyChange, otherCurrencies, negativeAccounts, caption, trailing }: BalanceHeroProps) {
  const { colors, shadows } = useTheme();
  const currencyGroupRef = useRef<View>(null);
  const selectCurrency = useCallback(
    (position: number) => {
      const code = availableCurrencies[position];
      if (code) {
        onCurrencyChange?.(code);
      }
    },
    [availableCurrencies, onCurrencyChange],
  );
  useRovingRadioGroup(currencyGroupRef, { onSelect: selectCurrency, enabled: Boolean(onCurrencyChange) });

  return (
    <View
      style={[styles.hero, { backgroundColor: colors.heroGradientStart, experimental_backgroundImage: `linear-gradient(135deg, ${colors.heroGradientStart} 0%, ${colors.heroGradientEnd} 100%)`, boxShadow: shadows.hero }]}
      accessible={false}>
      <View style={styles.orbitLarge} />
      <View style={styles.orbitSmall} />

      <View style={styles.topRow}>
        <View style={styles.flex}>
          <AppText variant="meta" color="onHeroMuted">
            Hesab balansı
          </AppText>
          {caption ? (
            <AppText variant="caption" color="onHeroMuted">
              {caption}
            </AppText>
          ) : null}
        </View>
        {availableCurrencies.length > 1 && onCurrencyChange ? (
          <View ref={currencyGroupRef} style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Valyuta" testID="currency-chips">
            {availableCurrencies.map((code) => {
              const selected = code === currencyCode;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="radio"
                  aria-checked={selected}
                  accessibilityLabel={code}
                  tabIndex={selected ? 0 : -1}
                  onPress={() => onCurrencyChange(code)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.chip, { backgroundColor: selected ? 'rgba(255,255,255,0.94)' : pressed ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.14)' }]}>
                  <AppText variant="caption" style={{ color: selected ? colors.heroGradientStart : colors.onHero }}>
                    {code}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {trailing}
      </View>

      <Entrance key={currencyCode} from="fade" style={styles.amountBlock}>
        <View style={styles.amountRow}>
          <AnimatedNumber value={totalBalance} currencyCode={currencyCode} variant="display" color="onHero" highlightNegative={false} showCode={false} accessibilityLabel={`Hesab balansı ${formatAmount(totalBalance, currencyCode)}`} />
          <AppText variant="subheading" color="onHeroMuted" style={styles.code}>
            {currencyCode}
          </AppText>
        </View>
        {otherCurrencies.length > 0 || negativeAccounts.length > 0 ? (
          <View style={styles.notes}>
            {otherCurrencies.map((other) => (
              <View key={other.currencyCode} style={styles.note}>
                <Ionicons name="globe-outline" size={13} color="rgba(255,255,255,0.84)" />
                <AppText variant="caption" color="onHeroMuted">
                  Ayrıca {formatAmount(other.totalBalance, other.currencyCode)} · {other.accountCount} hesab
                </AppText>
              </View>
            ))}
            {negativeAccounts.length > 0 ? (
              <View style={styles.note}>
                <Ionicons name="alert-circle" size={13} color="#FFD3D3" />
                <AppText variant="caption" style={{ color: '#FFD3D3' }}>
                  Mənfi balans: {negativeAccounts.map((account) => account.name).join(', ')}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </Entrance>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: Spacing.xxs,
  },
  hero: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    gap: Spacing.md,
    overflow: 'hidden',
  },
  orbitLarge: {
    position: 'absolute',
    right: -70,
    top: -110,
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  orbitSmall: {
    position: 'absolute',
    right: -24,
    top: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  chip: {
    minHeight: 30,
    minWidth: MinTouchTarget,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBlock: {
    gap: Spacing.xs,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  code: {
    marginBottom: 3,
  },
  notes: {
    gap: Spacing.xxs,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
});
