import { fireEvent, render, within } from '@testing-library/react-native';

import { BalanceHero } from '@/components/balance-hero';
import { CategoryField } from '@/components/category-field';
import { FilterToggle } from '@/components/filter-toggle';
import { SegmentedControl } from '@/components/segmented-control';
import { SelectionSheet } from '@/components/selection-sheet';
import { TabBar } from '@/components/tab-bar';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/finance',
}));

/**
 * Selection state of the shared controls.
 *
 * react-native-web 0.21 dropped `accessibilityState`, so every control describes its state with the matching
 * `aria-*` prop instead. React Native merges that prop back into `accessibilityState`, which is what this
 * renderer exposes — so these tests prove the native half of the mapping and guard against a regression to
 * `accessibilityState`-only props. The rendered DOM attributes are verified separately in the browser run
 * (`docs/screenshots-3a-a11y/results.json`), because props alone cannot prove what the web renders.
 */
describe('selection state on shared controls', () => {
  it('SegmentedControl is a radio group whose checked item follows the value', async () => {
    const onChange = jest.fn();
    const view = await render(
      <SegmentedControl
        accessibilityLabel="Növ"
        value="Expense"
        onChange={onChange}
        options={[
          { value: 'Expense', label: 'Xərc' },
          { value: 'Income', label: 'Gəlir' },
        ]}
      />,
    );

    const expense = view.getByRole('radio', { name: 'Xərc' });
    const income = view.getByRole('radio', { name: 'Gəlir' });
    expect(expense.props.accessibilityState.checked).toBe(true);
    expect(income.props.accessibilityState.checked).toBe(false);
    // Exactly one tab stop: the group is entered once and traversed with the arrow keys.
    expect(expense.props.tabIndex).toBe(0);
    expect(income.props.tabIndex).toBe(-1);
    // Container roles are not accessibility elements in this renderer, so the group is matched by its testID;
    // the rendered `role="radiogroup"` and its label are asserted in the browser run.
    const group = view.getByTestId('segmented-control');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe('Növ');

    await fireEvent.press(income);
    expect(onChange).toHaveBeenCalledWith('Income');
  });

  it('a disabled SegmentedControl reports the state and does not fire', async () => {
    const onChange = jest.fn();
    const view = await render(
      <SegmentedControl
        accessibilityLabel="Növ"
        value="Expense"
        onChange={onChange}
        disabled
        options={[
          { value: 'Expense', label: 'Xərc' },
          { value: 'Income', label: 'Gəlir' },
        ]}
      />,
    );

    const income = view.getByRole('radio', { name: 'Gəlir' });
    expect(income.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(income);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('SegmentedControl keeps the full name when the visible label is abbreviated', async () => {
    const view = await render(
      <SegmentedControl
        accessibilityLabel="Öyün"
        value="Breakfast"
        onChange={jest.fn()}
        options={[
          { value: 'Breakfast', label: 'Səhər', accessibilityLabel: 'Səhər yeməyi' },
          { value: 'Lunch', label: 'Nahar' },
        ]}
      />,
    );

    expect(view.getByRole('radio', { name: 'Səhər yeməyi' }).props.accessibilityState.checked).toBe(true);
  });

  it('CategoryField chips are a radio group and "Hamısı" stays outside it', async () => {
    const categories = [
      { id: 'cat-market', name: 'Market', kind: 'Expense' as const },
      { id: 'cat-restaurant', name: 'Restoran', kind: 'Expense' as const },
    ];
    const view = await render(<CategoryField categories={categories} value="cat-market" onChange={jest.fn()} />);

    const group = view.getByTestId('category-shortcuts');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    const market = view.getByRole('radio', { name: 'Market' });
    expect(market.props.accessibilityState.checked).toBe(true);
    expect(view.getByRole('radio', { name: 'Restoran' }).props.accessibilityState.checked).toBe(false);
    expect(market.props.tabIndex).toBe(0);

    // A button inside a radio group would be invalid; the sheet trigger is a sibling.
    const all = view.getByRole('button', { name: 'Hamısı' });
    expect(within(group).queryByRole('button', { name: 'Hamısı' })).toBeNull();
    expect(all).toBeTruthy();
  });

  it('SelectionSheet rows are radios with one checked option', async () => {
    const onSelect = jest.fn();
    const view = await render(
      <SelectionSheet
        visible
        title="Hesab"
        value="acc-cash"
        onSelect={onSelect}
        onClose={jest.fn()}
        options={[
          { value: 'acc-cash', label: 'Nağd' },
          { value: 'acc-card', label: 'Kart' },
          { value: 'acc-old', label: 'Köhnə', disabled: true },
        ]}
      />,
    );

    expect(view.getByTestId('selection-options').props.accessibilityRole).toBe('radiogroup');
    const rows = view.getAllByRole('radio');
    expect(rows.filter((row) => row.props.accessibilityState.checked === true)).toHaveLength(1);
    expect(view.getByRole('radio', { name: 'Nağd' }).props.accessibilityState.checked).toBe(true);
    expect(view.getByRole('radio', { name: 'Köhnə' }).props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(view.getByRole('radio', { name: 'Köhnə' }));
    expect(onSelect).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('radio', { name: 'Kart' }));
    expect(onSelect).toHaveBeenCalledWith('acc-card');
  });

  it('SelectionSheet mounts its options only while open, so the pending choice resets to the committed value', async () => {
    const options = [
      { value: 'acc-cash' as const, label: 'Nağd' },
      { value: 'acc-card' as const, label: 'Kart' },
    ];
    const closed = await render(<SelectionSheet visible={false} title="Hesab" value="acc-cash" onSelect={jest.fn()} onClose={jest.fn()} options={options} />);
    expect(closed.queryAllByRole('radio')).toHaveLength(0);

    const open = await render(<SelectionSheet visible title="Hesab" value="acc-card" onSelect={jest.fn()} onClose={jest.fn()} options={options} />);
    // The checked row comes from the committed value every time the dialog is mounted; arrow keys move a pending
    // copy of it, which the browser run verifies (docs/screenshots-3a-a11y).
    expect(open.getByRole('radio', { name: 'Kart' }).props.accessibilityState.checked).toBe(true);
    expect(open.getByRole('radio', { name: 'Nağd' }).props.accessibilityState.checked).toBe(false);
  });

  it('FilterToggle is a checkbox that reports its checked state', async () => {
    const onChange = jest.fn();
    const view = await render(<FilterToggle label="Arxivdəkilər" value={false} onChange={onChange} count={2} />);

    const toggle = view.getByRole('checkbox', { name: 'Arxivdəkilər, 2' });
    expect(toggle.props.accessibilityState.checked).toBe(false);

    await fireEvent.press(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('BalanceHero currency chips are a radio group', async () => {
    const onCurrencyChange = jest.fn();
    const view = await render(
      <BalanceHero totalBalance={250.5} currencyCode="AZN" availableCurrencies={['AZN', 'USD']} onCurrencyChange={onCurrencyChange} otherCurrencies={[]} negativeAccounts={[]} />,
    );

    expect(view.getByTestId('currency-chips').props.accessibilityRole).toBe('radiogroup');
    expect(view.getByRole('radio', { name: 'AZN' }).props.accessibilityState.checked).toBe(true);
    expect(view.getByRole('radio', { name: 'USD' }).props.accessibilityState.checked).toBe(false);

    await fireEvent.press(view.getByRole('radio', { name: 'USD' }));
    expect(onCurrencyChange).toHaveBeenCalledWith('USD');
  });

  it('TabBar keeps native tab semantics for route destinations', async () => {
    const navigate = jest.fn();
    const view = await render(
      <TabBar
        state={{ index: 1, routes: [{ key: 'a', name: 'index' }, { key: 'b', name: 'finance' }] }}
        navigation={{ navigate, emit: () => ({ defaultPrevented: false }) }}
      />,
    );

    // On iOS and Android a bottom bar is a tab bar; the web build renders links instead (browser evidence).
    expect(view.getByRole('tab', { name: 'Maliyyə' }).props.accessibilityState.selected).toBe(true);
    expect(view.getByRole('tab', { name: 'Ana səhifə' }).props.accessibilityState.selected).toBe(false);

    await fireEvent.press(view.getByRole('tab', { name: 'Ana səhifə' }));
    expect(navigate).toHaveBeenCalledWith('index');
  });
});
