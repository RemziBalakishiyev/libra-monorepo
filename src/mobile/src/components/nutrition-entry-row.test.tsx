import { render } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import { NutritionEntryRow, portionSummary } from '@/components/nutrition-entry-row';
import { breakfastEntry, lunchEntry } from '@/test/nutrition-fixtures';

describe('portion summary', () => {
  it('names the portion of a single food and counts several', () => {
    expect(portionSummary(breakfastEntry)).toBe('1 porsiya');
    expect(portionSummary(lunchEntry)).toBe('2 yemək');
    expect(portionSummary({ ...breakfastEntry, items: [{ ...breakfastEntry.items[0]!, quantityMode: 'Per100Grams', quantity: 150 }] })).toBe('150 q');
  });
});

describe('NutritionEntryRow', () => {
  const props = { onPress: jest.fn(), onMore: jest.fn(), time: '08:15' };

  it('prints the time and portion, and speaks the macros that do not fit the line', async () => {
    const view = await render(<NutritionEntryRow entry={breakfastEntry} {...props} />);

    expect(view.getByText('Omlet')).toBeTruthy();
    expect(view.getByText('08:15 · 1 porsiya')).toBeTruthy();
    expect(view.getByText('250 kkal')).toBeTruthy();
    // The three macro figures are spoken in full words rather than crammed into the printed line.
    expect(view.getByTestId(`nutrition-entry-${breakfastEntry.id}`).props.accessibilityLabel).toBe('Omlet, 08:15, 1 porsiya, 250 kkal, Zülal 18,0 q, Karbohidrat 3,0 q, Yağ 19,0 q');
  });

  it('keeps the name and the figure whole at enlarged text', async () => {
    const fontScale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.35);
    try {
      const long = { ...lunchEntry, items: [{ ...lunchEntry.items[0]!, name: 'Ev şəraitində bişirilmiş toyuq döşü' }, lunchEntry.items[1]!] };
      const view = await render(<NutritionEntryRow entry={long} {...props} time="13:30" />);

      // Nothing is dropped when the row reflows: the name, the meta line, the extra-food count and the energy.
      expect(view.getByText('Ev şəraitində bişirilmiş toyuq döşü')).toBeTruthy();
      expect(view.getByText('13:30 · 2 yemək')).toBeTruthy();
      expect(view.getByText('+1')).toBeTruthy();
      expect(view.getByText('445 kkal')).toBeTruthy();
    } finally {
      fontScale.mockRestore();
    }
  });
});
