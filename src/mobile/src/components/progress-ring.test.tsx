import { render } from '@testing-library/react-native';

import { ProgressRing, halfAngles } from '@/components/progress-ring';
import { AppText } from '@/components/text';

describe('ring geometry', () => {
  // Each disc covers 180°; rotating it back by the unswept part is what leaves the arc visible in its clip.
  it.each([
    [0, -180, -180],
    [90, -90, -180],
    [180, 0, -180],
    [270, 0, -90],
    [360, 0, 0],
  ])('rotates the halves for a %s° sweep', (degrees, right, left) => {
    expect(halfAngles(degrees)).toEqual({ right, left });
  });

  it('never lets a value outside the circle unwind a half back into view', () => {
    // A full ring stays full, and an empty one stays empty, whatever the caller passes.
    expect(halfAngles(400)).toEqual({ right: 0, left: 0 });
    expect(halfAngles(-20)).toEqual({ right: -180, left: -180 });
  });
});

describe('ProgressRing', () => {
  it('is decorative, with the real figures in its accessible name', async () => {
    const view = await render(
      <ProgressRing percent={100} color="#2F6B4F" accessibilityLabel="Kalori hədəfi: 2.506 kkal / 1.800 kkal" testID="ring">
        <AppText>139%</AppText>
      </ProgressRing>,
    );

    expect(view.getByTestId('ring')).toHaveTextContent('139%');
    expect(view.getByLabelText('Kalori hədəfi: 2.506 kkal / 1.800 kkal')).toBeTruthy();
  });
});
