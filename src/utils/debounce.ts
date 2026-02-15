type Fn<TArgs extends readonly unknown[]> = (...args: TArgs) => void;

export interface Debounced<TArgs extends readonly unknown[]> {
  (...args: TArgs): void;
  cancel: () => void;
}

export function debounce<TArgs extends readonly unknown[]>(
  fn: Fn<TArgs>,
  waitMs: number
): Debounced<TArgs> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const wrapped = (...args: TArgs): void => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), waitMs);
  };

  wrapped.cancel = (): void => {
    if (!timeout) return;
    clearTimeout(timeout);
    timeout = undefined;
  };

  return wrapped;
}
