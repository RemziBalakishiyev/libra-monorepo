import { z } from 'zod';

import { accountTypeSchema, categoryKindSchema } from '@/lib/api/finance';
import { isIsoDate } from '@/lib/dates';
import { parseAmount } from '@/lib/money';

const amountText = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .refine((value) => parseAmount(value) !== null && parseAmount(value)! > 0, 'Məbləğ sıfırdan böyük olmalı və ən çox 2 onluq rəqəm olmalıdır.');

const signedAmountText = z
  .string()
  .trim()
  .refine((value) => value === '' || value === '-' || parseAmount(value.replace(/^-/, '')) !== null, 'Məbləğ ən çox 2 onluq rəqəm olmalıdır.');

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Valyuta 3 hərfli kod olmalıdır (məs. AZN).');

export const isoDateSchema = z.string().trim().refine(isIsoDate, 'Tarix YYYY-AA-GG formatında olmalıdır.');

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, 'Hesab adı daxil edin.').max(100, 'Ad çox uzundur.'),
  type: accountTypeSchema,
  currencyCode: currencyCodeSchema,
  openingBalance: signedAmountText,
  isIncludedInTotal: z.boolean(),
});

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, 'Kateqoriya adı daxil edin.').max(100, 'Ad çox uzundur.'),
  kind: categoryKindSchema,
});

export const transactionFormSchema = z.object({
  accountId: z.string().min(1, 'Hesab seçin.'),
  categoryId: z.string().min(1, 'Kateqoriya seçin.'),
  amount: amountText('Məbləğ daxil edin.'),
  date: isoDateSchema,
  note: z.string().trim().max(500, 'Qeyd çox uzundur.'),
});

export const transferFormSchema = z
  .object({
    sourceAccountId: z.string().min(1, 'Mənbə hesabı seçin.'),
    destinationAccountId: z.string().min(1, 'Təyinat hesabı seçin.'),
    sourceAmount: amountText('Məbləğ daxil edin.'),
    destinationAmount: z.string().trim(),
    sameCurrency: z.boolean(),
    date: isoDateSchema,
    note: z.string().trim().max(500, 'Qeyd çox uzundur.'),
  })
  .superRefine((form, context) => {
    if (form.sourceAccountId && form.sourceAccountId === form.destinationAccountId) {
      context.addIssue({ code: 'custom', path: ['destinationAccountId'], message: 'Mənbə və təyinat hesabları fərqli olmalıdır.' });
    }
    if (!form.sameCurrency) {
      const destination = parseAmount(form.destinationAmount);
      if (destination === null || destination <= 0) {
        context.addIssue({ code: 'custom', path: ['destinationAmount'], message: 'Təyinat məbləğini daxil edin (fərqli valyuta).' });
      }
    }
  });

export const budgetFormSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1, 'Ay seçin.').max(12, 'Ay seçin.'),
  currencyCode: currencyCodeSchema,
  categoryId: z.string(), // '' = overall budget
  amount: amountText('Büdcə məbləğini daxil edin.'),
});

/** A monthly plan. The day is the *requested* day; short months clamp it on the server and ask again next month. */
export const recurringTemplateFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Ad daxil edin.').max(120, 'Ad çox uzundur.'),
    type: z.enum(['Income', 'Expense']),
    amount: amountText('Məbləğ daxil edin.'),
    categoryId: z.string().min(1, 'Kateqoriya seçin.'),
    accountId: z.string().min(1, 'Hesab seçin.'),
    dayOfMonth: z.number().int().min(1, 'Ayın gününü seçin.').max(31, 'Ayın gününü seçin.'),
    startDate: isoDateSchema,
    endDate: z.union([isoDateSchema, z.literal('')]),
    note: z.string().trim().max(500, 'Qeyd çox uzundur.'),
  })
  .refine((form) => form.endDate === '' || form.endDate >= form.startDate, { message: 'Bitmə tarixi başlanğıcdan əvvəl ola bilməz.', path: ['endDate'] });

/** The review before a month is recorded: the account, the actual amount and the actual date. */
export const recordOccurrenceFormSchema = z.object({
  accountId: z.string().min(1, 'Hesab seçin.'),
  amount: amountText('Məbləğ daxil edin.'),
  date: isoDateSchema,
  note: z.string().trim().max(500, 'Qeyd çox uzundur.'),
});

/**
 * A debt. `movesCash` is the explicit choice: an obligation that already exists needs no account and changes no
 * balance; money lent or borrowed now needs the account it moves through.
 */
export const debtFormSchema = z
  .object({
    direction: z.enum(['Receivable', 'Payable']),
    counterpartyName: z.string().trim().min(1, 'Qarşı tərəfin adını daxil edin.').max(120, 'Ad çox uzundur.'),
    principal: amountText('Məbləğ daxil edin.'),
    currencyCode: currencyCodeSchema,
    openedOn: isoDateSchema,
    dueOn: z.union([isoDateSchema, z.literal('')]),
    note: z.string().trim().max(500, 'Qeyd çox uzundur.'),
    movesCash: z.boolean(),
    accountId: z.string(),
  })
  .refine((form) => form.dueOn === '' || form.dueOn >= form.openedOn, { message: 'Son tarix açılış tarixindən əvvəl ola bilməz.', path: ['dueOn'] })
  .refine((form) => !form.movesCash || form.accountId !== '', { message: 'Pulun hansı hesabdan hərəkət etdiyini seçin.', path: ['accountId'] });

export const debtPaymentFormSchema = z.object({
  accountId: z.string().min(1, 'Hesab seçin.'),
  amount: amountText('Məbləğ daxil edin.'),
  date: isoDateSchema,
  note: z.string().trim().max(500, 'Qeyd çox uzundur.'),
});

export type RecurringTemplateForm = z.infer<typeof recurringTemplateFormSchema>;
export type RecordOccurrenceForm = z.infer<typeof recordOccurrenceFormSchema>;
export type DebtForm = z.infer<typeof debtFormSchema>;
export type DebtPaymentForm = z.infer<typeof debtPaymentFormSchema>;

export type AccountForm = z.infer<typeof accountFormSchema>;
export type CategoryForm = z.infer<typeof categoryFormSchema>;
export type TransactionForm = z.infer<typeof transactionFormSchema>;
export type TransferForm = z.infer<typeof transferFormSchema>;
export type BudgetForm = z.infer<typeof budgetFormSchema>;

/** Parses the signed opening balance text ("", "-", "-12,5") into a number. */
export function parseSignedAmount(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '-') {
    return 0;
  }
  const negative = trimmed.startsWith('-');
  const parsed = parseAmount(trimmed.replace(/^-/, '')) ?? 0;
  return negative ? -parsed : parsed;
}
