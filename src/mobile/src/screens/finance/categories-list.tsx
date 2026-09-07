import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { FilterToggle } from '@/components/filter-toggle';
import { FieldGroup } from '@/components/form-field';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { categoryColor, categoryVisual } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useCategories } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import type { Category, CategoryKind } from '@/lib/api/finance';
import { withAlpha } from '@/lib/color';

interface CategoryGroupDefinition {
  kind: CategoryKind;
  title: string;
  emptyMessage: string;
}

const groups: readonly CategoryGroupDefinition[] = [
  { kind: 'Expense', title: 'Xərc kateqoriyaları', emptyMessage: 'Hələ xərc kateqoriyası yoxdur.' },
  { kind: 'Income', title: 'Gəlir kateqoriyaları', emptyMessage: 'Hələ gəlir kateqoriyası yoxdur.' },
];

/**
 * Expense and income categories in two groups. Archived ones come with the same request and are hidden behind
 * a switch, so toggling is instant and the edit form opens from the same cache entry.
 */
export function CategoriesListScreen() {
  const router = useRouter();
  const { layout } = useTheme();
  const [includeArchived, setIncludeArchived] = useState(false);
  const categories = useCategories(undefined, true);
  const all = categories.data ?? [];
  const archivedCount = all.filter((category) => category.isArchived).length;
  const visible = includeArchived ? all : all.filter((category) => !category.isArchived);
  const wide = layout === 'wide';

  const openNew = () => router.push('/finance/categories/new');
  const open = (id: string) => router.push(`/finance/categories/${id}`);

  const sections = groups.map((group, index) => (
    <CategoryGroup
      key={group.kind}
      group={group}
      items={visible.filter((category) => category.kind === group.kind)}
      index={index + 1}
      onOpen={open}
      style={wide ? styles.column : undefined}
    />
  ));

  return (
    <Screen refreshing={categories.isRefetching} onRefresh={() => void categories.refetch()}>
      <ScreenHeader back title="Kateqoriyalar" size="compact" trailing={<IconButton icon="add" accessibilityLabel="Yeni kateqoriya" variant="primary" onPress={openNew} />} />

      {categories.isPending ? <ListSkeleton rows={6} label="Kateqoriyalar yüklənir…" /> : null}
      {categories.isError ? <ErrorState error={categories.error} onRetry={() => void categories.refetch()} /> : null}

      {categories.isSuccess && all.length > 0 ? (
        <Entrance index={0} style={styles.filterRow}>
          <FilterToggle label="Arxivdəkilər" count={archivedCount} value={includeArchived} onChange={setIncludeArchived} accessibilityHint="Arxivlənmiş kateqoriyaları siyahıya əlavə edir" />
        </Entrance>
      ) : null}

      {categories.isSuccess && visible.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="Kateqoriya yoxdur"
          message={
            archivedCount > 0
              ? 'Bütün kateqoriyalar arxivdədir. Onları görmək üçün "Arxivdəkilər" filtrini açın.'
              : 'Xərc və gəlirləri qruplaşdırmaq üçün ilk kateqoriyanı yaradın.'
          }
          actionTitle="Yeni kateqoriya"
          onAction={openNew}
        />
      ) : null}

      {categories.isSuccess && visible.length > 0 ? wide ? <View style={styles.columns}>{sections}</View> : sections : null}
    </Screen>
  );
}

type CategoryGroupProps = {
  group: CategoryGroupDefinition;
  items: Category[];
  index: number;
  onOpen: (id: string) => void;
  style?: StyleProp<ViewStyle>;
};

/** One kind: heading plus a white surface with the rows. The surface stays even when the group is empty. */
function CategoryGroup({ group, items, index, onOpen, style }: CategoryGroupProps) {
  return (
    <Entrance index={index} style={[styles.section, style]}>
      <SectionHeader title={group.title} />
      <FieldGroup>
        {items.length === 0 ? (
          <AppText variant="caption" color="textSecondary" style={styles.groupEmpty}>
            {group.emptyMessage}
          </AppText>
        ) : (
          items.map((category, position) => (
            <CategoryRow key={category.id} category={category} isLast={position === items.length - 1} onPress={() => onOpen(category.id)} />
          ))
        )}
      </FieldGroup>
    </Entrance>
  );
}

type CategoryRowProps = {
  category: Category;
  onPress: () => void;
  isLast: boolean;
};

/** Icon in a soft tint circle, name, and "sistem" / "arxivdə" metadata. Colour follows the name, never the position. */
function CategoryRow({ category, onPress, isLast }: CategoryRowProps) {
  const { colors, scheme } = useTheme();
  const visual = categoryVisual(category.name, category.kind);
  const tint = categoryColor(category.name, scheme, category.kind);
  const metaParts: string[] = [];
  if (category.isSystemDefault) {
    metaParts.push('sistem');
  }
  if (category.isArchived) {
    metaParts.push('arxivdə');
  }
  const meta = metaParts.join(' · ');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={meta ? `${category.name}, ${meta}` : category.name}
      accessibilityHint="Kateqoriyanı açır"
      onPress={onPress}
      scaleTo={0.99}
      containerStyle={styles.full}
      pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
      style={[styles.row, { borderBottomColor: colors.border }, isLast ? styles.last : null, category.isArchived ? styles.archived : null]}>
      <View style={[styles.icon, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.18 : 0.12) }]}>
        <Ionicons name={visual.icon} size={18} color={tint} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {category.name}
        </AppText>
        {meta ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
  },
  full: {
    width: '100%',
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.section,
  },
  column: {
    flex: 1,
  },
  section: {
    gap: Spacing.md,
  },
  groupEmpty: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 12,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last: {
    borderBottomWidth: 0,
  },
  archived: {
    opacity: 0.7,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
});
