export let debounce = function (func: (...args: any[]) => void, wait: number) {
  var timeout: NodeJS.Timeout | undefined;
  return function (this: unknown, ...args: any[]) {
    var later = () => {
      timeout = undefined;
      func.apply(this, args);
    };
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
};
