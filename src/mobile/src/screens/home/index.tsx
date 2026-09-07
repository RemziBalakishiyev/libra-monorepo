import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { MetricItem } from '@/components/metric-item';
import { PressableScale } from '@/components/pressable-scale';
import type { QuickActionKind } from '@/components/quick-action';
import { QuickAddMenu } from '@/components/quick-add-menu';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { Sheet } from '@/components/sheet';
import { InlineError, Skeleton, StaleNotice } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useAccounts, useDashboard } from '@/hooks/use-finance';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import type { Dashboard } from '@/lib/api/finance';
import { withAlpha } from '@/lib/color';
import { formatMonth, formatWeekdayDate } from '@/lib/dates';
import { quickActionHref } from '@/lib/quick-add';

type ModuleHref = '/finance' | '/nutrition' | '/plan' | '/ai';

interface ModuleDefinition {
  key: string;
  title: string;
  /** One-line description of what the module covers (never data or statistics). */
  caption: string;
  icon: IconName;
  accent: Extract<ThemeColor, 'moduleFinance' | 'moduleNutrition' | 'modulePlan' | 'moduleAi'>;
  href: ModuleHref;
  /** True for tabs that only show a "Tezliklə" placeholder in this phase. */
  placeholder: boolean;
}

/** The module entries. Order matches the tab bar. */
const modules: readonly ModuleDefinition[] = [
  { key: 'finance', title: 'Maliyyə', caption: 'Balans, əməliyyatlar və büdcə', icon: 'wallet-outline', accent: 'moduleFinance', href: '/finance', placeholder: false },
  { key: 'nutrition', title: 'Qidalanma', caption: 'Yeməklər, kalori və makrolar', icon: 'nutrition-outline', accent: 'moduleNutrition', href: '/nutrition', placeholder: true },
  { key: 'plan', title: 'Plan', caption: 'Tapşırıqlar və yuxu', icon: 'checkbox-outline', accent: 'modulePlan', href: '/plan', placeholder: true },
  { key: 'ai', title: 'AI', caption: 'Məlumatlarınız üzrə köməkçi', icon: 'sparkles-outline', accent: 'moduleAi', href: '/ai', placeholder: true },
];

/** "remzi" from "remzi@example.com" for the greeting when no display name is set. */
function localPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * Signed-in home: greeting, this month's finance summary built only from real data (account balance kept
 * apart from the month's cash flow), Quick Add in the header, and a quiet list of modules.
 */
export function Home() {
  const router = useRouter();
  const { layout } = useTheme();
  const profile = useProfile();
  const accounts = useAccounts();
  const dashboard = useDashboard({});
  const hasAccounts = (accounts.data?.length ?? 0) > 0;
  const [dateLabel, setDateLabel] = useState(() => formatWeekdayDate(new Date()));
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [transferGate, setTransferGate] = useState(false);

  const name = profile.data ? (profile.data.displayName?.trim() || localPart(profile.data.email)) : null;
  const greeting = name ? `Salam, ${name}` : 'Salam';
  const wide = layout === 'wide';

  const onRefresh = () => {
    setRefreshing(true);
    setDateLabel(formatWeekdayDate(new Date()));
    void Promise.allSettled([accounts.refetch(), dashboard.refetch(), profile.refetch()]).finally(() => setRefreshing(false));
  };

  const onQuickAdd = (kind: QuickActionKind) => {
    setMenuOpen(false);
    if (kind === 'transfer' && (accounts.data?.length ?? 0) < 2) {
      setTransferGate(true);
      return;
    }
    router.push(quickActionHref(kind));
  };

  const finance = (
    <View style={styles.section}>
      <SectionHeader title="Bu ay" actionTitle={hasAccounts ? 'Maliyyə' : undefined} onAction={hasAccounts ? () => router.navigate('/finance') : undefined} />
      {dashboard.isError && dashboard.data ? <StaleNotice error={dashboard.error} onRetry={() => void dashboard.refetch()} /> : null}
      {accounts.isPending || (hasAccounts && dashboard.isPending) ? (
        <SummarySkeleton />
      ) : accounts.isError ? (
        <InlineError error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : !hasAccounts ? (
        <SetupCard onSetup={() => router.push('/finance/setup')} />
      ) : dashboard.data ? (
        <SummaryCard dashboard={dashboard.data} />
      ) : dashboard.isError ? (
        <InlineError error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : null}
    </View>
  );

  const moduleList = (
    <View style={styles.section}>
      <SectionHeader title="Modullar" />
      <ModuleList onOpen={(module) => router.navigate(module.href)} />
    </View>
  );

  return (
    <Screen tabInset refreshing={refreshing} onRefresh={onRefresh} testID="home-screen">
      <Entrance index={0}>
        <ScreenHeader
          eyebrow={dateLabel}
          title={greeting}
          trailing={
            <>
              {hasAccounts && !wide ? <IconButton icon="add" accessibilityLabel="Tez əlavə et" accessibilityHint="Xərc, gəlir və ya köçürmə əlavə et" variant="primary" onPress={() => setMenuOpen(true)} testID="home-quick-add" /> : null}
              <IconButton icon="person-circle-outline" accessibilityLabel="Profil və seçimlər" accessibilityHint="Profil səhifəsini açır" variant="filled" size={24} onPress={() => router.push('/profile')} />
            </>
          }
        />
      </Entrance>

      {wide ? (
        <View style={styles.columns}>
          <Entrance index={1} style={styles.columnMain}>
            {finance}
          </Entrance>
          <Entrance index={2} style={styles.columnSide}>
            {moduleList}
          </Entrance>
        </View>
      ) : (
        <>
          <Entrance index={1}>{finance}</Entrance>
          <Entrance index={2}>{moduleList}</Entrance>
        </>
      )}

      <QuickAddMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onSelect={onQuickAdd} origin="top-right" />
      <Sheet visible={transferGate} onClose={() => setTransferGate(false)} title="Köçürmə üçün iki hesab lazımdır" presentation="dialog" scrollable={false} maxWidth={420}>
        <View style={styles.gate}>
          <AppText color="textSecondary">Köçürmə hesablar arasında aparılır. İkinci hesabı yaradın, sonra köçürmə edə bilərsiniz.</AppText>
          <Button
            title="Hesab yarat"
            icon="add"
            onPress={() => {
              setTransferGate(false);
              router.push('/finance/accounts/new');
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

/** Bones shaped like the summary card: label, balance, divider, three metrics. */
function SummarySkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLiveRegion="polite" accessibilityLabel="Maliyyə məlumatları yüklənir…">
      <Skeleton width={110} height={12} />
      <Skeleton width="58%" height={32} radius={Radius.md} />
      <Skeleton width={150} height={12} />
      <View style={[styles.metrics, styles.metricsDivider, { borderTopColor: colors.border }]}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={styles.metricBone}>
            <Skeleton width={48} height={12} />
            <Skeleton width="80%" height={20} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Soft invitation to set Finance up: the one useful action when there is no account yet. */
function SetupCard({ onSetup }: { onSetup: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, styles.softCard, { backgroundColor: colors.primarySoft }]}>
      <View style={[styles.softIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name="wallet-outline" size={24} color={colors.primary} />
      </View>
      <View style={styles.softText}>
        <AppText variant="heading">Maliyyə hələ quraşdırılmayıb</AppText>
        <AppText color="textSecondary">İlk hesabınızı yaradın; standart kateqoriyalar avtomatik əlavə olunacaq.</AppText>
      </View>
      <Button title="Maliyyəni quraşdır" icon="arrow-forward" onPress={onSetup} />
    </View>
  );
}

/**
 * The real numbers, kept apart: the current balance of all accounts in the dashboard currency, and this month's
 * cash flow (income, expense, net). Net cash flow is never presented as the balance.
 */
function SummaryCard({ dashboard }: { dashboard: Dashboard }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
      <View style={styles.cardTop}>
        <AppText variant="meta" color="textSecondary">
          Hesab balansı
        </AppText>
        <View style={styles.amountRow}>
          <MoneyText amount={dashboard.totalBalance} currencyCode={dashboard.currencyCode} variant="display" highlightNegative showCode={false} accessibilityLabel={`Hesab balansı ${formatAmount(dashboard.totalBalance, dashboard.currencyCode)}`} />
          <AppText variant="subheading" color="textSecondary" style={styles.code}>
            {dashboard.currencyCode}
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted">
          {dashboard.accounts.length} hesab · cəmə daxil olanlar
          {dashboard.otherCurrencies.length > 0 ? ` · ayrıca ${dashboard.otherCurrencies.map((other) => formatAmount(other.totalBalance, other.currencyCode)).join(', ')}` : ''}
        </AppText>
      </View>
      <View style={[styles.flowBlock, { borderTopColor: colors.border }]}>
        <AppText variant="caption" color="textMuted">
          Bu ayın pul axını · {formatMonth(dashboard.year, dashboard.month)}
        </AppText>
        <View style={styles.metrics}>
          <MetricItem label="Gəlir" amount={dashboard.monthlyIncome} currencyCode={dashboard.currencyCode} flow="Income" />
          <MetricItem label="Xərc" amount={dashboard.monthlyExpense} currencyCode={dashboard.currencyCode} flow="Expense" />
          <MetricItem label="Xalis axın" amount={dashboard.monthlyNet} currencyCode={dashboard.currencyCode} flow="Net" />
        </View>
      </View>
    </View>
  );
}

/** Compact module rows on one surface: the live module with a chevron, the upcoming ones marked "Tezliklə". */
function ModuleList({ onOpen }: { onOpen: (module: ModuleDefinition) => void }) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.moduleList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {modules.map((module, index) => {
        const tint = colors[module.accent];
        return (
          <PressableScale
            key={module.key}
            accessibilityRole="button"
            accessibilityLabel={module.placeholder ? `${module.title}, tezliklə` : module.title}
            accessibilityHint={module.caption}
            onPress={() => onOpen(module)}
            scaleTo={0.99}
            containerStyle={styles.full}
            pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
            style={[styles.moduleRow, index < modules.length - 1 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null]}>
            <View style={[styles.moduleIcon, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.22 : 0.12) }]}>
              <Ionicons name={module.icon} size={18} color={tint} />
            </View>
            <View style={styles.moduleText}>
              <AppText variant={module.placeholder ? 'body' : 'bodyStrong'} color={module.placeholder ? 'textSecondary' : 'textPrimary'} numberOfLines={1}>
                {module.title}
              </AppText>
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {module.caption}
              </AppText>
            </View>
            {module.placeholder ? (
              <View style={[styles.soonChip, { backgroundColor: colors.surfaceSubtle }]}>
                <AppText variant="caption" color="textMuted">
                  Tezliklə
                </AppText>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    width: '100%',
  },
  section: {
    gap: Spacing.md,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxl,
  },
  columnMain: {
    flex: 3,
    minWidth: 0,
  },
  columnSide: {
    flex: 2,
    minWidth: 0,
  },
  card: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.lg,
  },
  softCard: {
    borderColor: 'transparent',
  },
  softIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  softText: {
    gap: Spacing.xs,
  },
  cardTop: {
    gap: Spacing.xxs,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  code: {
    marginBottom: 2,
  },
  flowBlock: {
    gap: Spacing.sm,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metrics: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  metricsDivider: {
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metricBone: {
    flex: 1,
    gap: Spacing.sm,
  },
  moduleList: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 8,
    paddingVertical: Spacing.sm,
  },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm + 2,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  soonChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.full,
  },
  gate: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.lg,
  },
});
