import { render } from '@testing-library/react-native';

import { BalanceHero } from '@/components/balance-hero';
import { Shadows, palettes } from '@/constants/theme';
import type { Theme } from '@/hooks/use-theme';

const mockTheme: { current: Theme } = {
  current: { scheme: 'light', preference: 'light', colors: palettes.light, shadows: Shadows.light, reducedMotion: false, layout: 'compact', width: 390, height: 844, pagePadding: 20 },
};
jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => mockTheme.current,
  layoutFor: () => 'compact',
}));

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;
}

describe('BalanceHero', () => {
  afterEach(() => {
    mockTheme.current = { ...mockTheme.current, scheme: 'light', colors: palettes.light, shadows: Shadows.light, reducedMotion: false };
  });

  it.each([
    ['light', palettes.light],
    ['dark', palettes.dark],
  ] as const)('renders the amount and code white on the hero in the %s palette', async (scheme, colors) => {
    mockTheme.current = { ...mockTheme.current, scheme, colors, shadows: Shadows[scheme] };
    const view = await render(<BalanceHero totalBalance={3126.41} currencyCode="AZN" availableCurrencies={['AZN', 'USD']} onCurrencyChange={jest.fn()} otherCurrencies={[]} negativeAccounts={[]} />);

    const amount = view.getByLabelText('Hesab balansı 3.126,41 AZN');
    expect(flatten(amount.props.style).color).toBe('#FFFFFF');
    expect(colors.onHero).toBe('#FFFFFF');
    // The primary-button foreground stays a separate token (dark on the pale green of the dark palette).
    expect(colors.onPrimary).toBe(scheme === 'dark' ? '#15231A' : '#FFFFFF');
  });

  it('keeps the white foreground after switching currency and under reduced motion', async () => {
    mockTheme.current = { ...mockTheme.current, scheme: 'dark', colors: palettes.dark, shadows: Shadows.dark, reducedMotion: true };
    const view = await render(<BalanceHero totalBalance={300} currencyCode="USD" availableCurrencies={['AZN', 'USD']} onCurrencyChange={jest.fn()} otherCurrencies={[]} negativeAccounts={[]} />);
    const amount = view.getByLabelText('Hesab balansı 300,00 USD');
    expect(flatten(amount.props.style).color).toBe('#FFFFFF');
    expect(amount.props.children).toBe('300,00');
  });
});
