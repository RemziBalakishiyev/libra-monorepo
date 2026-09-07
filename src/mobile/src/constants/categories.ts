import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { CategoryColors, type CategoryColorName } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface CategoryVisual {
  icon: IconName;
  colorName: CategoryColorName;
}

/** Default categories created by `POST /api/finance/setup`, mapped to one icon family and a stable colour. */
const knownCategories: Record<string, CategoryVisual> = {
  Ev: { icon: 'home-outline', colorName: 'indigo' },
  Market: { icon: 'cart-outline', colorName: 'teal' },
  Restoran: { icon: 'restaurant-outline', colorName: 'orange' },
  Nəqliyyat: { icon: 'bus-outline', colorName: 'blue' },
  Kredit: { icon: 'card-outline', colorName: 'coral' },
  Kommunal: { icon: 'flash-outline', colorName: 'amber' },
  Sağlamlıq: { icon: 'medkit-outline', colorName: 'rose' },
  İdman: { icon: 'barbell-outline', colorName: 'green' },
  Təhsil: { icon: 'school-outline', colorName: 'violet' },
  Əyləncə: { icon: 'game-controller-outline', colorName: 'olive' },
  Abunəliklər: { icon: 'repeat-outline', colorName: 'violet' },
  'Digər xərc': { icon: 'ellipsis-horizontal-circle-outline', colorName: 'slate' },
  Maaş: { icon: 'briefcase-outline', colorName: 'green' },
  Bonus: { icon: 'gift-outline', colorName: 'amber' },
  Freelance: { icon: 'laptop-outline', colorName: 'blue' },
  'Digər gəlir': { icon: 'add-circle-outline', colorName: 'slate' },
};

const fallbackOrder: CategoryColorName[] = ['indigo', 'teal', 'amber', 'coral', 'blue', 'violet', 'green', 'rose', 'olive', 'orange'];

/** Icon and colour name for a category. User-created categories hash their name so the colour is stable. */
export function categoryVisual(name: string, kind: 'Income' | 'Expense' = 'Expense'): CategoryVisual {
  const known = knownCategories[name];
  if (known) {
    return known;
  }
  return {
    icon: kind === 'Income' ? 'trending-up-outline' : 'pricetag-outline',
    colorName: fallbackOrder[hash(name) % fallbackOrder.length]!,
  };
}

export function categoryColor(name: string, scheme: 'light' | 'dark', kind: 'Income' | 'Expense' = 'Expense'): string {
  return CategoryColors[scheme][categoryVisual(name, kind).colorName];
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

export interface AccountVisual {
  icon: IconName;
  label: string;
}

export function accountVisual(type: string): AccountVisual {
  switch (type) {
    case 'Cash':
      return { icon: 'cash-outline', label: 'Nağd' };
    case 'BankCard':
      return { icon: 'card-outline', label: 'Bank kartı' };
    case 'BankAccount':
      return { icon: 'business-outline', label: 'Bank hesabı' };
    case 'Savings':
      return { icon: 'lock-closed-outline', label: 'Yığım' };
    default:
      return { icon: 'wallet-outline', label: 'Digər' };
  }
}
