import { renderHook } from '@testing-library/react-native';

import { newClientRequestId, useClientRequestId } from '@/lib/client-request-id';

describe('client request ids', () => {
  it('generates RFC 4122 style ids', () => {
    expect(newClientRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientRequestId()).not.toBe(newClientRequestId());
  });

  it('keeps the same id across retries and re-renders until reset', async () => {
    const hook = await renderHook(() => useClientRequestId());

    const first = hook.result.current.current();
    const second = hook.result.current.current();
    await hook.rerender({});
    const afterRerender = hook.result.current.current();

    expect(second).toBe(first);
    expect(afterRerender).toBe(first);

    hook.result.current.reset();
    expect(hook.result.current.current()).not.toBe(first);
  });
});
