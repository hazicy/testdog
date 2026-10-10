// Capture evidence at the action boundary; persist it in order off the action path.
// Backpressure bounds retained files/tasks, and failures remain visible at finalization.
export class PersistenceQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = new Set<Promise<void>>();
  private failure?: unknown;
  constructor(private capacity = 16) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid queue capacity');
  }
  get busy() {
    return this.pending.size > 0;
  }
  assertComplete() {
    if (this.failure) throw this.failure;
  }
  async enqueue(operation: () => Promise<void>) {
    while (this.pending.size >= this.capacity) await Promise.race(this.pending);
    this.assertComplete();
    const task = this.tail.then(operation).catch((error) => {
      this.failure ??= error;
    });

    this.pending.add(task);
    this.tail = task;
    void task.then(() => this.pending.delete(task));
  }
  async drain() {
    while (this.pending.size) await Promise.all(this.pending);
    this.assertComplete();
  }
}
