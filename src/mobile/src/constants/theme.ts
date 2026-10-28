/**
 * Libra design tokens — the single visual source of truth for production screens.
 *
 * Light-first, calm, data-rich, in a warm green system: an off-white canvas, deep-green primary and hero, a
 * sage soft surface and one pistachio accent that is always paired with dark text. Every colour is semantic;
 * screens and components never use raw values.
 * Both palettes expose identical keys so components stay theme-agnostic. Motion and layout constants live
 * here too so durations, breakpoints, and spacing come from one place.
 *
 * Accent colours (`income`, `expense`, `transfer`, `warning`, `primary`) are for fills, icons and decoration.
 * Meaningful small text uses the matching `*Text` foreground, which clears 4.5:1 on white, on the canvas and on
 * the corresponding soft surface (see docs/DESIGN-SYSTEM.md for the measured pairs).
 */

import { Easing } from 'react-native-reanimated';

export interface Palette {
  /** Page background. */
  canvas: string;
  /** Cards, sheets, inputs on the canvas. */
  surface: string;
  /** Tonal grouping without a border (chips, list groups, secondary buttons). */
  surfaceSubtle: string;
  /** Sheets, menus, toasts above the page. */
  surfaceRaised: string;
  /** Pressed/hovered tonal surface. */
  surfaceInteractive: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  /** Captions and metadata: still readable text (≥ 4.5:1 on every light surface). */
  textMuted: string;
  /** Placeholder text inside inputs (≥ 4.5:1 on white). */
  textPlaceholder: string;
  /** Disabled controls only — exempt from the contrast rule, never used for meaningful copy. */
  textDisabled: string;
  /** Text on the primary button (dark on the light indigo of the dark palette). */
  onPrimary: string;
  /** Text on the deep-green hero: white in both palettes, and never `onPrimary` (dark in the dark palette). */
  onHero: string;
  onHeroMuted: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primaryAccent: string;
  /** Primary-tinted text on white and on `primarySoft` (links, soft buttons). */
  primaryText: string;
  heroGradientStart: string;
  heroGradientEnd: string;
  /** One layer of the hero's tonal glow: a low-alpha pistachio wash, stacked three times behind the illustration. */
  heroGlow: string;
  /** Pistachio highlight for one chip or figure per surface; always paired with `onAccent`. */
  accent: string;
  onAccent: string;
  income: string;
  incomeSoft: string;
  incomeText: string;
  expense: string;
  expenseSoft: string;
  expenseText: string;
  transfer: string;
  transferSoft: string;
  transferText: string;
  warning: string;
  warningSoft: string;
  warningText: string;
  error: string;
  errorSoft: string;
  /**
   * Nutrition macros. The fills are muted so three bars next to each other stay calm; the `*Text` foregrounds
   * are the readable version for labels and figures (≥ 4.5:1 on surface, canvas and the tinted summary).
   */
  protein: string;
  proteinText: string;
  carb: string;
  carbText: string;
  fat: string;
  fatText: string;
  /** The nutrition summary's softly tinted surface, and its border. */
  nutritionTint: string;
  nutritionTintBorder: string;
  moduleFinance: string;
  moduleNutrition: string;
  /** Plan's accent is the primary green: the module had a leftover blue that belonged to no palette. */
  modulePlan: string;
  moduleSleep: string;
  moduleAi: string;
  skeleton: string;
  skeletonHighlight: string;
  scrim: string;
  /** Tab bar / sidebar surface (opaque). */
  navSurface: string;
  navBorder: string;
}

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    canvas: '#F5F3EE',
    surface: '#FFFEFA',
    surfaceSubtle: '#EDEFE8',
    surfaceRaised: '#FFFEFA',
    surfaceInteractive: '#E8EBE3',
    border: '#D8DED5',
    borderStrong: '#BFC8BE',
    textPrimary: '#182A23',
    textSecondary: '#5E6C63',
    textMuted: '#56645B',
    textPlaceholder: '#56645B',
    textDisabled: '#A9B3AA',
    onPrimary: '#FFFFFF',
    onHero: '#FFFFFF',
    onHeroMuted: 'rgba(255, 255, 255, 0.84)',
    primary: '#1E5345',
    primaryPressed: '#163E34',
    primarySoft: '#E4EADF',
    primaryAccent: '#2C6E5C',
    primaryText: '#1E5345',
    heroGradientStart: '#102F28',
    heroGradientEnd: '#1A473B',
    heroGlow: 'rgba(216, 235, 134, 0.07)',
    accent: '#D8EB86',
    onAccent: '#182A23',
    income: '#109B72',
    incomeSoft: '#E4F4EC',
    incomeText: '#087A58',
    expense: '#DC5656',
    expenseSoft: '#FBEAE8',
    expenseText: '#B83F4A',
    transfer: '#3978E8',
    transferSoft: '#E8EFFB',
    transferText: '#2B5FC0',
    warning: '#D68A17',
    warningSoft: '#FCF2DC',
    warningText: '#8A5A0A',
    error: '#B83F4A',
    errorSoft: '#FBEAE8',
    protein: '#3E8C7A',
    proteinText: '#2B6A5E',
    carb: '#9A8A2C',
    carbText: '#6B5E12',
    fat: '#C07A3C',
    fatText: '#8A5320',
    nutritionTint: '#EDF0E6',
    nutritionTintBorder: '#DCE2D2',
    moduleFinance: '#1E5345',
    moduleNutrition: '#128A7E',
    modulePlan: '#1E5345',
    moduleSleep: '#6765D8',
    moduleAi: '#8758D5',
    skeleton: '#E8EBE3',
    skeletonHighlight: '#F5F3EE',
    scrim: 'rgba(24, 42, 35, 0.42)',
    navSurface: '#FFFEFA',
    navBorder: '#D8DED5',
  },
  dark: {
    canvas: '#0E1713',
    surface: '#18251F',
    surfaceSubtle: '#1F2F27',
    surfaceRaised: '#1E2D25',
    surfaceInteractive: '#2A3D33',
    border: '#30443A',
    borderStrong: '#44594E',
    textPrimary: '#F3F4ED',
    textSecondary: '#B3BDB3',
    textMuted: '#A3AEA4',
    textPlaceholder: '#A3AEA4',
    textDisabled: '#5C6B60',
    onPrimary: '#15231A',
    onHero: '#FFFFFF',
    onHeroMuted: 'rgba(255, 255, 255, 0.84)',
    primary: '#C9DD95',
    primaryPressed: '#D9E9AE',
    primarySoft: '#263A2B',
    primaryAccent: '#B7CE7E',
    primaryText: '#C9DD95',
    heroGradientStart: '#102F28',
    heroGradientEnd: '#1A473B',
    heroGlow: 'rgba(216, 235, 134, 0.06)',
    accent: '#D8EB86',
    onAccent: '#15231A',
    income: '#38D2A0',
    incomeSoft: '#14352A',
    incomeText: '#4ADBA8',
    expense: '#FF7377',
    expenseSoft: '#3B2426',
    expenseText: '#FF8A8D',
    transfer: '#69A0FF',
    transferSoft: '#1E2E42',
    transferText: '#8FA8FF',
    warning: '#F3BD57',
    warningSoft: '#3A301A',
    warningText: '#F6C363',
    error: '#FF8A8D',
    errorSoft: '#3B2426',
    protein: '#6FBFA3',
    proteinText: '#8FCBA6',
    carb: '#C9B85E',
    carbText: '#D9C86A',
    fat: '#D9946A',
    fatText: '#E8A87C',
    nutritionTint: '#1B2A22',
    nutritionTintBorder: '#2B3E33',
    moduleFinance: '#C9DD95',
    moduleNutrition: '#3BC2B4',
    modulePlan: '#C9DD95',
    moduleSleep: '#9B98F0',
    moduleAi: '#B08CF0',
    skeleton: '#1F2F27',
    skeletonHighlight: '#2A3D33',
    scrim: 'rgba(0, 0, 0, 0.55)',
    navSurface: '#18251F',
    navBorder: '#30443A',
  },
};

export type ThemeColor = keyof Palette;

/** 4-point spacing grid. */
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 28,
  xxxl: 32,
  huge: 40,
} as const;

export const Radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing?: number;
}

/** Type ramp. Money uses `tabular-nums` through `MoneyText`. At most three weights on a screen. */
export const Type = {
  hero: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.8 },
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2 },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.6 },
} as const satisfies Record<string, TypeStyle>;

export type TypeName = keyof typeof Type;

/**
 * `boxShadow` strings (RN 0.86). Deliberately light: borders and tonal surfaces do the grouping, shadows only
 * separate floating layers (nav, sheets, toasts) from the page.
 */
export const Shadows = {
  light: {
    card: '0 1px 2px rgba(24, 42, 35, 0.05)',
    raised: '0 4px 14px rgba(24, 42, 35, 0.08)',
    overlay: '0 12px 32px rgba(24, 42, 35, 0.16)',
    hero: '0 8px 22px rgba(16, 47, 40, 0.20)',
    nav: '0 2px 12px rgba(24, 42, 35, 0.08)',
    fab: '0 6px 16px rgba(30, 83, 69, 0.28)',
  },
  dark: {
    card: '0 1px 2px rgba(0, 0, 0, 0.25)',
    raised: '0 4px 14px rgba(0, 0, 0, 0.35)',
    overlay: '0 12px 32px rgba(0, 0, 0, 0.5)',
    hero: '0 6px 18px rgba(0, 0, 0, 0.35)',
    nav: '0 2px 12px rgba(0, 0, 0, 0.4)',
    fab: '0 6px 16px rgba(0, 0, 0, 0.4)',
  },
} as const;

export type ShadowName = keyof typeof Shadows.light;

export const Motion = {
  /** Press feedback. */
  press: 110,
  /** Chips, toggles, selection changes. */
  quick: 160,
  /** Screen and section entrances. */
  base: 220,
  /** Indicators moving on screen. */
  move: 240,
  /** Sheets, popovers. */
  sheet: 260,
  /** Value tickers, progress, charts. */
  data: 400,
  /** Delay between staggered section entrances; capped at `staggerCap` slots. */
  stagger: 32,
  staggerCap: 5,
  pressScale: 0.97,
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  easeInOut: Easing.bezier(0.77, 0, 0.175, 1),
  easeSheet: Easing.bezier(0.32, 0.72, 0, 1),
} as const;

/** Minimum touch target on both platforms. */
export const MinTouchTarget = 48;

export const Layout = {
  phonePadding: 20,
  widePadding: 32,
  maxContent: 1120,
  maxForm: 560,
  maxFormWide: 960,
  sidebarWidth: 248,
  railWidth: 84,
  /** Height of the floating tab pill. */
  tabBarHeight: 60,
  /** Space above the pill inside its reserved region. */
  tabBarGutter: 8,
  breakpoints: { medium: 640, wide: 1024 },
} as const;

/** Kept for compatibility with earlier code: the main content width on wide layouts. */
export const MaxContentWidth = Layout.maxContent;

/**
 * Categorical colours for finance categories, assigned by category name (never by position) so a category keeps
 * its colour across dashboard, forms, lists, and charts. Every hue clears 3:1 against both canvases.
 */
export const CategoryColors = {
  light: {
    indigo: '#1E5345',
    teal: '#159E91',
    amber: '#D68A17',
    coral: '#DC5656',
    blue: '#3978E8',
    violet: '#8758D5',
    green: '#2F9E5B',
    rose: '#D2497E',
    olive: '#7A9A1F',
    orange: '#E0722C',
    slate: '#64748B',
  },
  dark: {
    indigo: '#C9DD95',
    teal: '#3BC2B4',
    amber: '#F3BD57',
    coral: '#FF7377',
    blue: '#69A0FF',
    violet: '#B08CF0',
    green: '#5BD58A',
    rose: '#F07AA6',
    olive: '#B5D24C',
    orange: '#FF9A5B',
    slate: '#94A3B8',
  },
} as const;

export type CategoryColorName = keyof typeof CategoryColors.light;
