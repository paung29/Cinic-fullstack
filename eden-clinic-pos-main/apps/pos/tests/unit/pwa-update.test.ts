import { expect, test, vi } from 'vitest';
import { createRestartGate } from '@/app/pwaUpdate';
import { createToastQueue } from '@/ui/Toast';

test('restart gate blocks only an uncommitted cart and resumes when the cart clears', () => {
  const events: string[] = [];
  const armControllerChangeReload = vi.fn(() => { events.push('arm'); });
  const skipWaiting = vi.fn(() => { events.push('skip'); });
  const gate = createRestartGate({ armControllerChangeReload, skipWaiting });

  expect(gate.state()).toEqual({ disabled: false });
  expect(gate.requestRestart()).toBe('restarting');
  expect(events).toEqual(['arm', 'skip']);
  expect(armControllerChangeReload).toHaveBeenCalledTimes(1);
  expect(skipWaiting).toHaveBeenCalledTimes(1);

  gate.setHasUncommittedCart(true);
  expect(gate.state()).toEqual({ disabled: true });
  expect(gate.requestRestart()).toBe('blocked');
  expect(armControllerChangeReload).toHaveBeenCalledTimes(1);
  expect(skipWaiting).toHaveBeenCalledTimes(1);

  gate.setHasUncommittedCart(false);
  expect(gate.state()).toEqual({ disabled: false });
  expect(gate.requestRestart()).toBe('restarting');
  expect(events).toEqual(['arm', 'skip', 'arm', 'skip']);
  expect(armControllerChangeReload).toHaveBeenCalledTimes(2);
  expect(skipWaiting).toHaveBeenCalledTimes(2);
});

test('toast queue carries a disabled restart action while retaining manual singleton dismissal', () => {
  const queue = createToastQueue();
  queue.enqueue('ordinary message');
  const updateId = queue.enqueue('Update ready', {
    label: 'Restart',
    testId: 'pwa-update-restart',
    disabled: true,
    disabledReason: 'Finish or abandon the current cart first.',
    onClick: vi.fn(),
  });

  expect(queue.current()?.message).toBe('ordinary message');
  queue.dismiss();
  expect(queue.current()).toMatchObject({
    id: updateId,
    action: {
      testId: 'pwa-update-restart',
      disabled: true,
      disabledReason: 'Finish or abandon the current cart first.',
    },
  });
  queue.dismiss();
  expect(queue.current()).toBeUndefined();
});
