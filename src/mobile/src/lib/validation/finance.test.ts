import { budgetFormSchema, parseSignedAmount, transactionFormSchema, transferFormSchema } from '@/lib/validation/finance';

describe('transactionFormSchema', () => {
  const valid = { accountId: 'a', categoryId: 'c', amount: '12,50', date: '2026-09-05', note: '' };

  it('accepts a valid form', () => {
    expect(transactionFormSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['', 'Məbləğ daxil edin.'],
    ['0', 'Məbləğ sıfırdan böyük olmalı və ən çox 2 onluq rəqəm olmalıdır.'],
    ['-5', 'Məbləğ sıfırdan böyük olmalı və ən çox 2 onluq rəqəm olmalıdır.'],
    ['1.005', 'Məbləğ sıfırdan böyük olmalı və ən çox 2 onluq rəqəm olmalıdır.'],
    ['abc', 'Məbləğ sıfırdan böyük olmalı və ən çox 2 onluq rəqəm olmalıdır.'],
  ])('rejects amount %p', (amount, message) => {
    const result = transactionFormSchema.safeParse({ ...valid, amount });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it('requires account, category, and a real date', () => {
    const result = transactionFormSchema.safeParse({ ...valid, accountId: '', categoryId: '', date: '2026-02-30' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['accountId', 'categoryId', 'date']);
  });
});

describe('transferFormSchema', () => {
  const valid = { sourceAccountId: 'a', destinationAccountId: 'b', sourceAmount: '10', destinationAmount: '', sameCurrency: true, date: '2026-09-05', note: '' };

  it('accepts a same-currency transfer without a destination amount', () => {
    expect(transferFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects the same account on both sides', () => {
    const result = transferFormSchema.safeParse({ ...valid, destinationAccountId: 'a' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['destinationAccountId']);
  });

  it('requires a destination amount for cross-currency transfers', () => {
    const result = transferFormSchema.safeParse({ ...valid, sameCurrency: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['destinationAmount']);
    expect(transferFormSchema.safeParse({ ...valid, sameCurrency: false, destinationAmount: '5,5' }).success).toBe(true);
  });
});

describe('budgetFormSchema', () => {
  it('validates period, currency, and amount', () => {
    expect(budgetFormSchema.safeParse({ year: 2026, month: 9, currencyCode: 'azn', categoryId: '', amount: '100' }).success).toBe(true);
    expect(budgetFormSchema.safeParse({ year: 2026, month: 13, currencyCode: 'AZN', categoryId: '', amount: '100' }).success).toBe(false);
    expect(budgetFormSchema.safeParse({ year: 2026, month: 9, currencyCode: 'AZNN', categoryId: '', amount: '100' }).success).toBe(false);
    expect(budgetFormSchema.safeParse({ year: 2026, month: 9, currencyCode: 'AZN', categoryId: '', amount: '0' }).success).toBe(false);
  });
});

describe('parseSignedAmount', () => {
  it('handles empty, negative, and comma input', () => {
    expect(parseSignedAmount('')).toBe(0);
    expect(parseSignedAmount('-')).toBe(0);
    expect(parseSignedAmount('-12,5')).toBe(-12.5);
    expect(parseSignedAmount('7')).toBe(7);
  });
});
