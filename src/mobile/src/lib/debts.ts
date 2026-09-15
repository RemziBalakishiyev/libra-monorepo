import type { Debt, DebtDirection, DebtMovement, DebtStatus } from '@/lib/api/debts';
import { formatShortDate, todayIsoDate } from '@/lib/dates';

/** "Mənə borcludurlar" / "Mən borcluyam" — the two views of Borclar. */
export const directionLabels: Record<DebtDirection, string> = {
  Receivable: 'Mənə borcludurlar',
  Payable: 'Mən borcluyam',
};

export const directionShortLabels: Record<DebtDirection, string> = {
  Receivable: 'Alacaq',
  Payable: 'Borc',
};

export const statusLabels: Record<DebtStatus, string> = {
  Open: 'Açıq',
  PartiallyPaid: 'Qismən ödənilib',
  Settled: 'Bağlanıb',
};

/** The verb for a payment, from the user's side of the table. */
export function paymentVerb(direction: DebtDirection): string {
  return direction === 'Receivable' ? 'Ödəniş alındı' : 'Ödəniş edildi';
}

/** What the opening movement was, from the user's side. */
export function openingVerb(direction: DebtDirection): string {
  return direction === 'Receivable' ? 'Borc verildi' : 'Borc alındı';
}

/** Signed cash effect of a payment of `amount` on the account, before it is recorded. */
export function paymentCashEffect(direction: DebtDirection, amount: number): number {
  return direction === 'Receivable' ? amount : -amount;
}

/** Signed cash effect of creating the debt with money moving now. */
export function openingCashEffect(direction: DebtDirection, principal: number): number {
  return direction === 'Receivable' ? -principal : principal;
}

/** "Son tarix: 30 sen", "Gecikib · 5 gün", or nothing. Overdue is the server's verdict, never recomputed here. */
export function dueLabel(debt: Pick<Debt, 'dueOn' | 'isOverdue' | 'status'>, today = todayIsoDate()): string | null {
  if (!debt.dueOn || debt.status === 'Settled') {
    return null;
  }
  if (debt.isOverdue) {
    const days = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${debt.dueOn}T00:00:00Z`)) / 86_400_000));
    return `Gecikib · ${days} gün`;
  }
  return `Son tarix: ${formatShortDate(debt.dueOn)}`;
}

/** One line for a history row: what happened and, if undone, that it was. */
export function describeMovement(direction: DebtDirection, movement: DebtMovement): string {
  const base = movement.kind === 'Opening' ? openingVerb(direction) : paymentVerb(direction);
  return movement.isReversed ? `${base} · geri alınıb` : base;
}
