import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { FieldMessage } from '@/components/form-field';
import { PressableScale } from '@/components/pressable-scale';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import { categoryColor, categoryVisual } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/color';

export interface CategoryOption {
  id: string;
  name: string;
  kind: 'Income' | 'Expense';
}

type CategoryFieldProps = {
  categories: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  /** One field-level message, announced as an alert. Shortcuts are never outlined individually. */
  error?: string;
  disabled?: boolean;
  label?: string;
  emptyMessage?: string;
  /** Ids used this month (real usage, most used first). When empty the configured order is kept as-is. */
  recentIds?: string[];
  /** Maximum shortcut chips under the field. */
  shortcutLimit?: number;
};

/** Case-insensitive contains, tolerant of Azerbaijani dotted/dotless i. */
function matches(name: string, query: string): boolean {
  const fold = (value: string) => value.toLocaleLowerCase('az').replace(/i̇/g, 'i');
  return fold(name).includes(fold(query.trim()));
}

/** Shortcut order: real recent usage first (when known), then the configured category order. */
export function orderCategories<T extends { id: string }>(categories: readonly T[], recentIds: readonly string[] = []): T[] {
  const recent = recentIds.map((id) => categories.find((category) => category.id === id)).filter((category): category is T => Boolean(category));
  const rest = categories.filter((category) => !recentIds.includes(category.id));
  return [...recent, ...rest];
}

/**
 * Category selection that never buries the rest of the form: a labelled field with the current choice, up to six
 * shortcut chips (recent usage first when it is known), and "Hamısı" opening a searchable sheet.
 */
export function CategoryField({ categories, value, onChange, error, disabled = false, label = 'Kateqoriya', emptyMessage = 'Bu növ üçün aktiv kateqoriya yoxdur.', recentIds = [], shortcutLimit = 6 }: CategoryFieldProps) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = categories.find((category) => category.id === value);
  const ordered = orderCategories(categories, recentIds);
  const shortcuts = ordered.slice(0, shortcutLimit);
  const hasRecent = recentIds.some((id) => categories.some((category) => category.id === id));
  const selectedVisual = selected ? categoryVisual(selected.name, selected.kind) : null;
  const selectedColor = selected ? categoryColor(selected.name, scheme, selected.kind) : colors.textMuted;

  return (
    <View style={styles.container}>
      <AppText variant="meta" color="textSecondary">
        {label}
      </AppText>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.name ?? 'seçilməyib'}`}
        accessibilityHint={error ?? 'Kateqoriya siyahısını açır'}
        accessibilityState={{ disabled }}
        disabled={disabled || categories.length === 0}
        onPress={() => setOpen(true)}
        scaleTo={0.99}
        containerStyle={styles.full}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]}
        testID="category-field">
        <View style={[styles.fieldIcon, { backgroundColor: selected ? withAlpha(selectedColor, scheme === 'dark' ? 0.22 : 0.12) : colors.surfaceSubtle }]}>
          <Ionicons name={selectedVisual?.icon ?? 'pricetag-outline'} size={18} color={selectedColor} />
        </View>
        <AppText variant="body" color={selected ? 'textPrimary' : 'textPlaceholder'} numberOfLines={1} style={styles.flex}>
          {selected?.name ?? 'Kateqoriya seçin'}
        </AppText>
        <AppText variant="meta" color="primaryText">
          {selected ? 'Dəyiş' : 'Seç'}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </PressableScale>
      <FieldMessage error={error} />

      {categories.length === 0 ? (
        <AppText variant="caption" color="textSecondary">
          {emptyMessage}
        </AppText>
      ) : (
        <View style={styles.shortcuts} accessibilityRole="radiogroup" accessibilityLabel={hasRecent ? 'Tez seçim: bu ay istifadə olunanlar' : 'Tez seçim'}>
          {shortcuts.map((category) => {
            const active = category.id === value;
            const visual = categoryVisual(category.name, category.kind);
            const color = categoryColor(category.name, scheme, category.kind);
            return (
              <PressableScale
                key={category.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active, disabled }}
                accessibilityLabel={category.name}
                disabled={disabled}
                onPress={() => onChange(category.id)}
                scaleTo={0.96}
                containerStyle={styles.chipSlot}
                pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
                style={[styles.chip, { backgroundColor: active ? withAlpha(color, scheme === 'dark' ? 0.24 : 0.12) : colors.surface, borderColor: active ? color : colors.border }]}>
                <Ionicons name={active ? 'checkmark-circle' : visual.icon} size={16} color={color} />
                <AppText variant="meta" color={active ? 'textPrimary' : 'textSecondary'} numberOfLines={1}>
                  {category.name}
                </AppText>
              </PressableScale>
            );
          })}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Hamısı"
            accessibilityHint="Bütün kateqoriyaları axtarışla açır"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => setOpen(true)}
            scaleTo={0.96}
            containerStyle={styles.chipSlot}
            pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
            style={[styles.chip, { backgroundColor: colors.surfaceSubtle, borderColor: colors.surfaceSubtle }]}>
            <Ionicons name="grid-outline" size={16} color={colors.textSecondary} />
            <AppText variant="meta" color="textSecondary">
              Hamısı
            </AppText>
          </PressableScale>
        </View>
      )}

      <CategorySheet
        visible={open}
        categories={ordered}
        value={value}
        title={label}
        recentCount={hasRecent ? Math.min(recentIds.length, shortcutLimit) : 0}
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          onChange(id);
          setOpen(false);
        }}
      />
    </View>
  );
}

type CategorySheetProps = {
  visible: boolean;
  categories: CategoryOption[];
  value: string;
  title: string;
  /** How many leading rows come from real usage (rendered with a small "bu ay" note). */
  recentCount?: number;
  onClose: () => void;
  onSelect: (id: string) => void;
};

/** Searchable list of every category of the current kind. */
export function CategorySheet({ visible, categories, value, title, recentCount = 0, onClose, onSelect }: CategorySheetProps) {
  const { colors, scheme } = useTheme();
  const [query, setQuery] = useState('');
  const filtered = query.trim() === '' ? categories : categories.filter((category) => matches(category.name, query));

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={title} accessibilityLabel={`${title} seçimi`} maxWidth={440}>
      <View style={[styles.search, { backgroundColor: colors.surfaceSubtle }]}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Kateqoriya axtar"
          value={query}
          onChangeText={setQuery}
          placeholder="Axtar"
          placeholderTextColor={colors.textPlaceholder}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.textPrimary }]}
          testID="category-search"
        />
      </View>
      {filtered.length === 0 ? (
        <AppText color="textSecondary" style={styles.empty}>
          Uyğun kateqoriya tapılmadı.
        </AppText>
      ) : (
        filtered.map((category, index) => {
          const active = category.id === value;
          const visual = categoryVisual(category.name, category.kind);
          const color = categoryColor(category.name, scheme, category.kind);
          const recent = query.trim() === '' && index < recentCount;
          return (
            <PressableScale
              key={category.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, checked: active }}
              accessibilityLabel={recent ? `${category.name}, bu ay istifadə olunub` : category.name}
              onPress={() => onSelect(category.id)}
              scaleTo={0.99}
              containerStyle={styles.full}
              pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
              style={[styles.option, { backgroundColor: active ? colors.primarySoft : 'transparent' }]}>
              <View style={[styles.optionIcon, { backgroundColor: withAlpha(color, scheme === 'dark' ? 0.22 : 0.12) }]}>
                <Ionicons name={visual.icon} size={18} color={color} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {category.name}
                </AppText>
                {recent ? (
                  <AppText variant="caption" color="textMuted">
                    Bu ay istifadə olunub
                  </AppText>
                ) : null}
              </View>
              {active ? <Ionicons name="checkmark" size={20} color={colors.primaryText} /> : null}
            </PressableScale>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  full: {
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget + 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  fieldIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  chipSlot: {
    minHeight: 40,
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget - 4,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  searchInput: {
    flex: 1,
    ...Type.body,
    fontSize: 16,
    paddingVertical: Spacing.sm,
  },
  empty: {
    padding: Spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
