import { setDisplayLocale } from '@/lib/money';
import {
  describeEntry,
  energyDifferenceLabel,
  formatGrams,
  formatKcal,
  formatQuantity,
  gramsDifferenceLabel,
  itemTotals,
  macroBreakdown,
  mealForHour,
  mealLabel,
  ringLabel,
  ringPercent,
  sumTotals,
  targetProgress,
} from '@/lib/nutrition';

const omelet = { name: 'Omlet', quantityMode: 'PerPortion', energyKcalPerUnit: 250, proteinGramsPerUnit: 18, carbGramsPerUnit: 3, fatGramsPerUnit: 19 } as const;
const rice = { name: 'Düyü', quantityMode: 'Per100Grams', energyKcalPerUnit: 130, proteinGramsPerUnit: 2.7, carbGramsPerUnit: 28.2, fatGramsPerUnit: 0.3 } as const;

describe('itemTotals', () => {
  it.each([
    [1, 250, 18],
    [2, 500, 36],
    [0.5, 125, 9],
    [1.5, 375, 27],
  ])('multiplies a portion count of %s', (quantity, energy, protein) => {
    const totals = itemTotals({ ...omelet, quantity });

    expect(totals.energyKcal).toBe(energy);
    expect(totals.proteinGrams).toBe(protein);
  });

  it.each([
    [100, 130, 28.2],
    [150, 195, 42.3],
    [75.5, 98.15, 21.29],
    [33, 42.9, 9.31],
  ])('scales %s g of a per-100-g food', (quantity, energy, carbs) => {
    const totals = itemTotals({ ...rice, quantity });

    expect(totals.energyKcal).toBe(energy);
    expect(totals.carbGrams).toBe(carbs);
  });

  it('rounds once, from the entered values', () => {
    // 33 g of 9.99 g per 100 g is 3.2967 g.
    expect(itemTotals({ ...rice, proteinGramsPerUnit: 9.99, quantity: 33 }).proteinGrams).toBe(3.3);
  });

  it('keeps the entered energy instead of deriving it from the macros', () => {
    // 4/4/9 would make this 96 kcal.
    const totals = itemTotals({ name: 'Bar', quantityMode: 'PerPortion', quantity: 1, energyKcalPerUnit: 120, proteinGramsPerUnit: 4, carbGramsPerUnit: 20, fatGramsPerUnit: 0 });

    expect(totals.energyKcal).toBe(120);
  });

  it('treats an explicit zero as a real value', () => {
    const totals = itemTotals({ name: 'Qara qəhvə', quantityMode: 'PerPortion', quantity: 1, energyKcalPerUnit: 2, proteinGramsPerUnit: 0, carbGramsPerUnit: 0, fatGramsPerUnit: 0 });

    expect(totals.fatGrams).toBe(0);
    expect(totals.energyKcal).toBe(2);
  });
});

describe('sumTotals', () => {
  it('adds items without floating drift', () => {
    const totals = sumTotals([itemTotals({ ...omelet, quantity: 1 }), itemTotals({ ...rice, quantity: 150 })]);

    expect(totals).toEqual({ energyKcal: 445, proteinGrams: 22.05, carbGrams: 45.3, fatGrams: 19.45 });
  });

  it('is zero for an empty meal', () => {
    expect(sumTotals([])).toEqual({ energyKcal: 0, proteinGrams: 0, carbGrams: 0, fatGrams: 0 });
  });
});

describe('targetProgress', () => {
  it('returns null when no target is set, so nothing is fabricated', () => {
    expect(targetProgress(1200, null)).toBeNull();
    expect(targetProgress(1200, undefined)).toBeNull();
    expect(targetProgress(1200, 0)).toBeNull();
  });

  it('reports the remaining amount and clamps only the bar', () => {
    const progress = targetProgress(1240, 2200)!;

    expect(progress.percent).toBeCloseTo(56.36, 1);
    expect(progress.remaining).toBe(960);
    expect(progress.over).toBe(false);
    expect(energyDifferenceLabel(progress)).toBe('960 kkal qalıb');
  });

  it('keeps the real figure visible when the target is exceeded', () => {
    const progress = targetProgress(2500, 2200)!;

    expect(progress.percent).toBe(100);
    expect(progress.remaining).toBe(-300);
    expect(progress.over).toBe(true);
    expect(energyDifferenceLabel(progress)).toBe('300 kkal artıq');
    expect(gramsDifferenceLabel(targetProgress(140.5, 130)!)).toBe('10,5 q artıq');
  });
});

describe('formatting', () => {
  beforeEach(() => setDisplayLocale('az-AZ'));
  afterAll(() => setDisplayLocale('az-AZ'));

  it('shows energy as whole kcal and macros with one decimal', () => {
    expect(formatKcal(1234.56)).toBe('1.235 kkal');
    expect(formatKcal(695, false)).toBe('695');
    expect(formatGrams(22.05)).toBe('22,1 q');
    expect(formatGrams(0)).toBe('0,0 q');
  });

  it('shows the quantity the way it was entered', () => {
    expect(formatQuantity('PerPortion', 1)).toBe('1 porsiya');
    expect(formatQuantity('PerPortion', 0.5)).toBe('0,50 porsiya');
    expect(formatQuantity('Per100Grams', 150)).toBe('150 q');
    expect(formatQuantity('Per100Grams', 75.5)).toBe('75,5 q');
  });

  it('follows the display locale', () => {
    setDisplayLocale('en-US');
    expect(formatKcal(1234)).toBe('1,234 kkal');
  });
});

describe('meal helpers', () => {
  it.each([
    [7, 'Breakfast'],
    [13, 'Lunch'],
    [19, 'Dinner'],
    [23, 'Snack'],
    [2, 'Snack'],
  ])('defaults hour %s to the natural meal', (hour, expected) => {
    expect(mealForHour(hour)).toBe(expected);
  });

  it('uses the Azerbaijani meal names', () => {
    expect(['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((meal) => mealLabel(meal as 'Breakfast'))).toEqual(['Səhər yeməyi', 'Nahar', 'Axşam yeməyi', 'Ara yemək']);
  });

  it('names an entry after its first food and counts the rest', () => {
    expect(describeEntry([{ name: 'Omlet' }])).toBe('Omlet');
    expect(describeEntry([{ name: 'Omlet' }, { name: 'Düyü' }])).toBe('Omlet +1');
    expect(describeEntry([])).toBe('Yemək');
  });
});

describe('macro breakdown', () => {
  const totals = { energyKcal: 695, proteinGrams: 40.1, carbGrams: 31.2, fatGrams: 19.3 };

  it('keeps each macro goal independently optional', () => {
    const rows = macroBreakdown(totals, { proteinGrams: 130, carbGrams: null, fatGrams: 70 });

    expect(rows.map((row) => row.label)).toEqual(['Zülal', 'Karbohidrat', 'Yağ']);
    // The untracked macro still reports its recorded grams; only its progress is absent.
    expect(rows[1]).toMatchObject({ value: 31.2, progress: null });
    expect(rows[0]!.progress).toMatchObject({ target: 130, over: false });
    expect(rows[2]!.progress).toMatchObject({ target: 70 });
  });

  it('reports the recorded grams when nothing at all is tracked', () => {
    expect(macroBreakdown(totals, null).map((row) => [row.value, row.progress])).toEqual([
      [40.1, null],
      [31.2, null],
      [19.3, null],
    ]);
  });
});

describe('ring figures', () => {
  it('clamps the drawn arc while the label keeps the real share', () => {
    const over = targetProgress(2400, 2200)!;
    expect(ringPercent(over)).toBe(100);
    // 2400 / 2200 is 109%, and that is what the centre says — exceeding is not completion.
    expect(ringLabel(over)).toBe('109%');
  });

  it('draws the real share below the target', () => {
    const under = targetProgress(695, 2200)!;
    expect(Math.round(ringPercent(under))).toBe(32);
    expect(ringLabel(under)).toBe('32%');
  });

  it('has nothing to draw or say without a target', () => {
    expect(ringPercent(null)).toBe(0);
    expect(ringLabel(null)).toBeNull();
  });
});
