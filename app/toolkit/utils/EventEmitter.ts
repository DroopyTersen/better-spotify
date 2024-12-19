export class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];
  constructor() {
    this.listeners = [];
  }
  subscribe = (listener: (value: T) => void) => {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  };

  emit = (value: T) => {
    for (const listener of this.listeners) {
      listener(value);
    }
  };
}
