import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface TabDefinition {
  name: string;
  title: string;
  icon: IoniconName;
  activeIcon: IoniconName;
  /** True for tabs that only show a "coming soon" placeholder in this phase. */
  placeholder: boolean;
}

/** The stable five-tab shell. Order matters. */
export const tabs: readonly TabDefinition[] = [
  { name: 'index', title: 'Ana səhifə', icon: 'home-outline', activeIcon: 'home', placeholder: false },
  { name: 'finance', title: 'Maliyyə', icon: 'wallet-outline', activeIcon: 'wallet', placeholder: false },
  { name: 'nutrition', title: 'Qidalanma', icon: 'nutrition-outline', activeIcon: 'nutrition', placeholder: false },
  { name: 'plan', title: 'Plan', icon: 'checkbox-outline', activeIcon: 'checkbox', placeholder: false },
  { name: 'ai', title: 'AI', icon: 'sparkles-outline', activeIcon: 'sparkles', placeholder: true },
];
