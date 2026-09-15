import { StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppearanceStore, type AppearancePreference } from '@/lib/appearance-store';

const choices: readonly { value: AppearancePreference; label: string; icon: IconName; hint: string }[] = [
  { value: 'light', label: 'Açıq', icon: 'sunny-outline', hint: 'Telefonun rejimindən asılı olmayaraq həmişə açıq.' },
  { value: 'dark', label: 'Tünd', icon: 'moon-outline', hint: 'Telefonun rejimindən asılı olmayaraq həmişə tünd.' },
  { value: 'system', label: 'Sistem', icon: 'phone-portrait-outline', hint: 'Telefonun rejiminə uyğunlaşır və onunla birlikdə dəyişir.' },
];

/**
 * "Görünüş": the one control that decides the palette. It is a device setting, not part of the profile form —
 * it applies the moment it is tapped, needs no "Yadda saxla", and is stored on this phone rather than on the
 * account, so two phones can differ.
 */
export function AppearanceSection() {
  const { scheme } = useTheme();
  const preference = useAppearanceStore((state) => state.preference);
  const setPreference = useAppearanceStore((state) => state.setPreference);
  const active = choices.find((choice) => choice.value === preference) ?? choices[0]!;

  return (
    <View style={styles.section} testID="profile-appearance">
      <SectionHeader title="Görünüş" />
      <SegmentedControl
        accessibilityLabel="Görünüş"
        testID="appearance-choice"
        value={preference}
        onChange={(value) => void setPreference(value)}
        options={choices.map((choice) => ({ value: choice.value, label: choice.label, icon: choice.icon }))}
      />
      <AppText variant="caption" color="textMuted" testID="appearance-hint">
        {active.hint}
        {preference === 'system' ? ` Hazırda: ${scheme === 'dark' ? 'tünd' : 'açıq'}.` : ''}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
});
