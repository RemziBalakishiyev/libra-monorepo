import { parseDecimalInput } from '@/lib/money';
import { nutritionEntryFormSchema, nutritionGoalFormSchema, nutritionItemFormSchema, parseTarget } from '@/lib/validation/nutrition';

const validItem = { name: 'Omlet', quantityMode: 'PerPortion' as const, quantity: '1', energyKcal: '250', protein: '18', carbs: '3', fat: '19' };
const validEntry = { mealType: 'Breakfast' as const, date: '2026-09-07', time: '09:30', note: '', items: [validItem] };

function itemError(patch: Partial<typeof validItem>, field: keyof typeof validItem): string | undefined {
  const result = nutritionItemFormSchema.safeParse({ ...validItem, ...patch });
  return result.success ? undefined : result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe('parseDecimalInput', () => {
  it('accepts both separators and the field precision', () => {
    expect(parseDecimalInput('12,5', 2)).toBe(12.5);
    expect(parseDecimalInput('12.5', 2)).toBe(12.5);
    expect(parseDecimalInput('0', 2)).toBe(0);
    expect(parseDecimalInput('0,75', 3)).toBe(0.75);
    expect(parseDecimalInput('150', 3)).toBe(150);
  });

  it('rejects text that is not a plain positive decimal', () => {
    expect(parseDecimalInput('', 2)).toBeNull();
    expect(parseDecimalInput('-5', 2)).toBeNull();
    expect(parseDecimalInput('12,345', 2)).toBeNull();
    expect(parseDecimalInput('1 234', 2)).toBeNull();
    expect(parseDecimalInput('abc', 2)).toBeNull();
  });
});

describe('nutritionItemFormSchema', () => {
  it('accepts a complete item with comma decimals', () => {
    expect(nutritionItemFormSchema.safeParse({ ...validItem, quantity: '0,5', protein: '18,25' }).success).toBe(true);
  });

  it('distinguishes a missing value from an entered zero', () => {
    expect(itemError({ fat: '' }, 'fat')).toBe('Dəyər daxil edin (0 da yazıla bilər).');
    expect(nutritionItemFormSchema.safeParse({ ...validItem, fat: '0' }).success).toBe(true);
  });

  it('rejects negative and over-precise nutrients', () => {
    expect(itemError({ protein: '-1' }, 'protein')).toBe('Ən çox 2 onluq rəqəm olan müsbət ədəd yazın.');
    expect(itemError({ energyKcal: '12,345' }, 'energyKcal')).toBe('Ən çox 2 onluq rəqəm olan müsbət ədəd yazın.');
  });

  it('requires a positive quantity with at most three decimals', () => {
    expect(itemError({ quantity: '0' }, 'quantity')).toBe('Miqdar sıfırdan böyük olmalıdır (ən çox 3 onluq rəqəm).');
    expect(itemError({ quantity: '' }, 'quantity')).toBe('Miqdar daxil edin.');
    expect(itemError({ quantity: '1,0005' }, 'quantity')).toBe('Miqdar sıfırdan böyük olmalıdır (ən çox 3 onluq rəqəm).');
    expect(nutritionItemFormSchema.safeParse({ ...validItem, quantity: '0,125' }).success).toBe(true);
  });

  it('requires a name', () => {
    expect(itemError({ name: '   ' }, 'name')).toBe('Yeməyin adını yazın.');
  });
});

describe('nutritionEntryFormSchema', () => {
  it('accepts a meal with one item', () => {
    expect(nutritionEntryFormSchema.safeParse(validEntry).success).toBe(true);
  });

  it('needs at least one item', () => {
    const result = nutritionEntryFormSchema.safeParse({ ...validEntry, items: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Ən azı bir yemək əlavə edin.');
  });

  it('validates the date and the 24-hour time', () => {
    expect(nutritionEntryFormSchema.safeParse({ ...validEntry, date: '07-09-2026' }).success).toBe(false);
    expect(nutritionEntryFormSchema.safeParse({ ...validEntry, time: '9:30' }).success).toBe(false);
    expect(nutritionEntryFormSchema.safeParse({ ...validEntry, time: '24:00' }).success).toBe(false);
    expect(nutritionEntryFormSchema.safeParse({ ...validEntry, time: '23:59' }).success).toBe(true);
  });
});

describe('nutrition goals form', () => {
  it('allows every target to be left empty', () => {
    expect(nutritionGoalFormSchema.safeParse({ energyKcal: '', protein: '', carbs: '', fat: '' }).success).toBe(true);
    expect(parseTarget('')).toBeNull();
    expect(parseTarget('  ')).toBeNull();
  });

  it('rejects zero and negative targets', () => {
    expect(nutritionGoalFormSchema.safeParse({ energyKcal: '0', protein: '', carbs: '', fat: '' }).success).toBe(false);
    expect(nutritionGoalFormSchema.safeParse({ energyKcal: '-100', protein: '', carbs: '', fat: '' }).success).toBe(false);
  });

  it('parses a typed target with a comma', () => {
    expect(parseTarget('2200')).toBe(2200);
    expect(parseTarget('70,5')).toBe(70.5);
  });
});
