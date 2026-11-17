import { useCallback, useState } from 'react';

/**
 * State a component owns until its parent passes `value`; then the parent owns it. Either way
 * `onChange` hears every change the component makes.
 */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : uncontrolled;

  const setValue = useCallback(
    (next: T) => {
      if (!controlled) setUncontrolled(next);

      onChange?.(next);
    },
    [controlled, onChange],
  );

  return [current, setValue] as const;
}
