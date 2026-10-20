import { expect, it, vi } from 'vitest';
import { PersistenceQueue } from '@testdog/server/execution/recording/persistenceQueue';

it('lets captured evidence proceed while persistence is slow, but bounds queued work', async () => {
  const queue = new PersistenceQueue(2);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const order: number[] = [];

  await queue.enqueue(async () => {
    await blocked;
    order.push(1);
  });
  await queue.enqueue(async () => {
    order.push(2);
  });
  const accepted = vi.fn();
  const third = queue
    .enqueue(async () => {
      order.push(3);
    })
    .then(accepted);

  await Promise.resolve();
  expect(accepted).not.toHaveBeenCalled();
  expect(order).toEqual([]);
  release();
  await third;
  await queue.drain();
  expect(order).toEqual([1, 2, 3]);
  expect(queue.busy).toBe(false);
});

it('drains already accepted evidence and reports a persistence failure at finalization', async () => {
  const queue = new PersistenceQueue();
  let fail!: () => void;
  const blocked = new Promise<void>((_, reject) => {
    fail = () => reject(new Error('storage failed'));
  });
  const later = vi.fn(async () => {});

  await queue.enqueue(() => blocked);
  await queue.enqueue(later);
  fail();
  await expect(queue.drain()).rejects.toThrow('storage failed');
  expect(later).toHaveBeenCalledOnce();
  await expect(queue.enqueue(async () => {})).rejects.toThrow('storage failed');
});
