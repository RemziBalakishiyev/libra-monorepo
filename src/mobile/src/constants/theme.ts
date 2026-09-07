/**
 * Libra design tokens — the single visual source of truth for production screens.
 *
 * Light-first, calm, data-rich. Every colour is semantic; screens and components never use raw values.
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
  /** Text on the deep-indigo hero gradient: white in both palettes. */
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
  moduleFinance: string;
  moduleNutrition: string;
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
    canvas: '#F5F7FB',
    surface: '#FFFFFF',
    surfaceSubtle: '#F0F3F8',
    surfaceRaised: '#FFFFFF',
    surfaceInteractive: '#E9EDF5',
    border: '#E2E7F0',
    borderStrong: '#CBD4E1',
    textPrimary: '#111827',
    textSecondary: '#5C6878',
    textMuted: '#5F6A7D',
    textPlaceholder: '#5F6A7D',
    textDisabled: '#AEB6C2',
    onPrimary: '#FFFFFF',
    onHero: '#FFFFFF',
    onHeroMuted: 'rgba(255, 255, 255, 0.84)',
    primary: '#4F5FE7',
    primaryPressed: '#3F4CC5',
    primarySoft: '#ECEEFF',
    primaryAccent: '#6F7BF0',
    primaryText: '#3F4CC5',
    heroGradientStart: '#30376F',
    heroGradientEnd: '#5159C6',
    income: '#109B72',
    incomeSoft: '#E6F7F1',
    incomeText: '#087A58',
    expense: '#DC5656',
    expenseSoft: '#FDECEC',
    expenseText: '#B83F4A',
    transfer: '#3978E8',
    transferSoft: '#EAF1FE',
    transferText: '#2B5FC0',
    warning: '#D68A17',
    warningSoft: '#FFF4DC',
    warningText: '#8A5A0A',
    error: '#B83F4A',
    errorSoft: '#FDECEC',
    moduleFinance: '#4F5FE7',
    moduleNutrition: '#159E91',
    modulePlan: '#3978E8',
    moduleSleep: '#6765D8',
    moduleAi: '#8758D5',
    skeleton: '#E9EDF5',
    skeletonHighlight: '#F5F7FB',
    scrim: 'rgba(17, 24, 39, 0.42)',
    navSurface: '#FFFFFF',
    navBorder: '#E2E7F0',
  },
  dark: {
    canvas: '#0C1017',
    surface: '#141A24',
    surfaceSubtle: '#19212D',
    surfaceRaised: '#1C2532',
    surfaceInteractive: '#233043',
    border: '#293545',
    borderStrong: '#39485E',
    textPrimary: '#F7F9FC',
    textSecondary: '#ADB7C6',
    textMuted: '#8B97AB',
    textPlaceholder: '#8B97AB',
    textDisabled: '#55617A',
    onPrimary: '#0C1017',
    onHero: '#FFFFFF',
    onHeroMuted: 'rgba(255, 255, 255, 0.84)',
    primary: '#8993F5',
    primaryPressed: '#A3ABF8',
    primarySoft: '#22284A',
    primaryAccent: '#9FA8FF',
    primaryText: '#A3ABF8',
    heroGradientStart: '#242B5E',
    heroGradientEnd: '#3E48A8',
    income: '#38D2A0',
    incomeSoft: '#12362C',
    incomeText: '#4ADBA8',
    expense: '#FF7377',
    expenseSoft: '#3B2124',
    expenseText: '#FF8A8D',
    transfer: '#69A0FF',
    transferSoft: '#1C2A44',
    transferText: '#8FA8FF',
    warning: '#F3BD57',
    warningSoft: '#3A2F15',
    warningText: '#F6C363',
    error: '#FF8A8D',
    errorSoft: '#3B2124',
    moduleFinance: '#8993F5',
    moduleNutrition: '#3BC2B4',
    modulePlan: '#69A0FF',
    moduleSleep: '#9B98F0',
    moduleAi: '#B08CF0',
    skeleton: '#1C2532',
    skeletonHighlight: '#233043',
    scrim: 'rgba(0, 0, 0, 0.55)',
    navSurface: '#171E2A',
    navBorder: '#293545',
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
    card: '0 1px 2px rgba(17, 24, 39, 0.04)',
    raised: '0 4px 14px rgba(17, 24, 39, 0.08)',
    overlay: '0 12px 32px rgba(17, 24, 39, 0.16)',
    hero: '0 6px 18px rgba(48, 55, 111, 0.16)',
    nav: '0 2px 12px rgba(17, 24, 39, 0.08)',
    fab: '0 6px 16px rgba(79, 95, 231, 0.28)',
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
    indigo: '#4F5FE7',
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
    indigo: '#8993F5',
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
