import { useEffect, useRef, useState } from 'react';

import { MoneyText, spokenMoney, type TextColor } from '@/components/text';
import { Motion, type TypeName } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AnimatedNumberProps = {
  value: number;
  currencyCode: string;
  variant?: TypeName;
  color?: TextColor;
  highlightNegative?: boolean;
  showCode?: boolean;
  /** Decimals shown; 0 for whole-unit figures such as kcal. */
  fractionDigits?: number;
  accessibilityLabel?: string;
  /** Animates only when the value changes after mount (never on background refetches that keep the value). */
  animateOnMount?: boolean;
};

/**
 * Number ticker for balances and summaries. Values change rarely (after a submission), so a short JS
 * `requestAnimationFrame` tween is acceptable; text content goes through React anyway. Reduced motion jumps
 * straight to the new value. Tabular numerals keep the width stable while ticking. The accessible name is
 * always the final value, so screen readers announce one change instead of every frame.
 */
export function AnimatedNumber({ value, currencyCode, variant = 'hero', color, highlightNegative = true, showCode = true, fractionDigits = 2, accessibilityLabel, animateOnMount = false }: AnimatedNumberProps) {
  const { reducedMotion } = useTheme();
  const [displayed, setDisplayed] = useState(animateOnMount ? 0 : value);
  const displayedRef = useRef(animateOnMount ? 0 : value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const from = displayedRef.current;
    if (from === value || reducedMotion || typeof requestAnimationFrame !== 'function') {
      displayedRef.current = value;
      return;
    }
    const started = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - started) / Motion.data);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress >= 1 ? value : Math.round((from + (value - from) * eased) * 100) / 100;
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
    };
  }, [value, reducedMotion]);

  const shown = reducedMotion || typeof requestAnimationFrame !== 'function' ? value : displayed;

  return (
    <MoneyText
      amount={shown}
      currencyCode={currencyCode}
      variant={variant}
      color={color}
      highlightNegative={highlightNegative}
      showCode={showCode}
      fractionDigits={fractionDigits}
      accessibilityLabel={accessibilityLabel ?? spokenMoney(value, currencyCode)}
      accessibilityLiveRegion="polite"
    />
  );
}
