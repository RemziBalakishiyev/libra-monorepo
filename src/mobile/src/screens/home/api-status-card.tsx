import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { AppText, type TextColor } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useApiHealth } from '@/hooks/use-api-health';
import { useTheme } from '@/hooks/use-theme';
import type { HealthReport } from '@/lib/api/health';

type HealthStatus = HealthReport['status'];

const statusLabels: Record<HealthStatus, string> = {
  Healthy: 'Hazırdır',
  Degraded: 'Məhdud işləyir',
  Unhealthy: 'Hazır deyil',
};

/** Colour plus a distinct icon per status, so the state never relies on colour alone. */
const statusVisuals: Record<HealthStatus, { color: TextColor; icon: IconName }> = {
  Healthy: { color: 'incomeText', icon: 'checkmark-circle' },
  Degraded: { color: 'warningText', icon: 'alert-circle' },
  Unhealthy: { color: 'error', icon: 'close-circle' },
};

/**
 * Settings-style block for the Profile screen: API readiness with loading, error-with-retry, and success states.
 * The section title ("Tətbiq vəziyyəti") is rendered by the screen; this block owns the report itself.
 */
export function ApiStatusCard() {
  const { colors, shadows } = useTheme();
  const health = useApiHealth();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]} accessibilityLabel="API vəziyyəti">
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name="server-outline" size={18} color={colors.textSecondary} />
        </View>
        <View style={styles.headerText}>
          <AppText variant="subheading">API vəziyyəti</AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            Serverin hazırlıq yoxlaması
          </AppText>
        </View>
      </View>

      {health.isPending ? (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <ActivityIndicator accessibilityLabel="Yoxlanılır" color={colors.primary} />
          <AppText color="textSecondary">Yoxlanılır…</AppText>
        </View>
      ) : null}

      {health.isError ? (
        <View style={styles.stack} accessibilityRole="alert">
          <View style={styles.row}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.error} />
            <AppText variant="bodyStrong" color="error" style={styles.flex}>
              API-yə qoşulmaq mümkün olmadı.
            </AppText>
          </View>
          <AppText variant="caption" color="textSecondary">
            {health.error.message}
          </AppText>
          <Button title="Yenidən cəhd et" variant="secondary" icon="refresh" onPress={() => void health.refetch()} />
        </View>
      ) : null}

      {health.isSuccess ? (
        <View style={styles.stack}>
          <View style={styles.row}>
            <Ionicons name={statusVisuals[health.data.status].icon} size={18} color={colors[statusVisuals[health.data.status].color]} />
            <AppText variant="bodyStrong" color={statusVisuals[health.data.status].color} style={styles.flex}>
              {`${statusLabels[health.data.status]} (${health.data.status})`}
            </AppText>
          </View>
          {health.data.checks.length > 0 ? (
            <View style={[styles.checks, { borderTopColor: colors.border }]}>
              {health.data.checks.map((check) => (
                <View key={check.name} style={styles.checkRow}>
                  <View style={[styles.checkDot, { backgroundColor: colors[statusVisuals[check.status].color] }]} />
                  <AppText variant="caption" color="textSecondary" style={styles.flex}>
                    {`${check.name}: ${check.status}`}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: Spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stack: {
    gap: Spacing.sm,
  },
  checks: {
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 20,
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
