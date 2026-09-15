import type { QuickActionKind } from '@/components/quick-action';

export type QuickAddHref = '/finance/transactions/new?type=Expense' | '/finance/transactions/new?type=Income' | '/finance/transfers/new' | '/nutrition/new' | '/plan/new' | '/sleep';

/**
 * Route for each Quick Add action. Money actions need Finance to be set up and transfers need two accounts;
 * the screens gate that before navigating. A meal and a task need nothing beyond a signed-in user.
 */
export function quickActionHref(kind: QuickActionKind): QuickAddHref {
  if (kind === 'expense') {
    return '/finance/transactions/new?type=Expense';
  }
  if (kind === 'income') {
    return '/finance/transactions/new?type=Income';
  }
  if (kind === 'meal') {
    return '/nutrition/new';
  }
  if (kind === 'task') {
    return '/plan/new';
  }
  // Sleep opens its screen rather than a creation form: starting or ending a night is always a deliberate press.
  if (kind === 'sleep') {
    return '/sleep';
  }
  return '/finance/transfers/new';
}

/** True for the actions that require at least one financial account. */
export function requiresFinanceSetup(kind: QuickActionKind): boolean {
  return kind !== 'meal' && kind !== 'task' && kind !== 'sleep';
}
