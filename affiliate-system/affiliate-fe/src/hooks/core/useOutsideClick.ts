import { useEffect } from 'react';

export function useOutsideClick<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: (event: MouseEvent) => void,
  active = true
) {
  useEffect(() => {
    if (!active) return;

    const listener = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Ignore clicks on toast notifications
      if (target.closest('.toast-container')) return;

      // Ignore clicks on tooltips (they are portaled to document.body)
      if (target.closest('[role="tooltip"]')) return;

      if (!ref.current || ref.current.contains(target)) return;
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
    };
  }, [ref, handler, active]);
}
