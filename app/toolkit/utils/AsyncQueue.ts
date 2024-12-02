import { EventEmitter } from "events";

/**
const queue = new AsyncQueue(2);

// Add tasks to the queue
for (let i = 1; i <= 6; i++) {
  queue.run(createTask(i))
    .then(result => console.log(`Result of task ${result}`))
    .catch(error => console.error(`Task ${i} error:`, error.message));
}

// Wait for all tasks to complete
await queue.waitForCompletion();
console.log('You can't add anymore tasks now');
 */
export class AsyncQueue extends EventEmitter {
  public running = 0;
  private queue: Array<{
    task: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  }> = [];
  private maxQueueSize: number;

  constructor(private concurrency: number, maxQueueSize = 5000) {
    super();
    this.maxQueueSize = maxQueueSize;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(
        new Error("Queue is full with " + this.queue.length + " items")
      );
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }

  private next() {
    if (this.running < this.concurrency && this.queue.length) {
      const { task, resolve, reject } = this.queue.shift()!;
      this.running++;

      task().then(
        (result) => {
          this.running--;
          resolve(result);
          this.emit("taskCompleted");
          this.next();
        },
        (error) => {
          this.running--;
          reject(error);
          this.emit("taskCompleted");
          this.next();
        }
      );
    }

    if (this.running === 0 && this.queue.length === 0) {
      this.emit("allTasksCompleted");
    }
  }

  async waitForAll(): Promise<void> {
    if (this.running === 0 && this.queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.once("allTasksCompleted", resolve);
    });
  }

  cancelAllPendingTasks() {
    const error = new Error("Task cancelled");
    while (this.queue.length > 0) {
      const { reject } = this.queue.pop()!;
      reject(error);
    }
  }
}
