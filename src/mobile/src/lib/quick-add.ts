import type { QuickActionKind } from '@/components/quick-action';

/** Route for each Quick Add action. Transfers need two accounts; screens gate that before navigating. */
export function quickActionHref(kind: QuickActionKind): '/finance/transactions/new?type=Expense' | '/finance/transactions/new?type=Income' | '/finance/transfers/new' {
  if (kind === 'expense') {
    return '/finance/transactions/new?type=Expense';
  }
  if (kind === 'income') {
    return '/finance/transactions/new?type=Income';
  }
  return '/finance/transfers/new';
}
