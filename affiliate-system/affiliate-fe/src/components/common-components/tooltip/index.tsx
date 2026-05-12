import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@components/core-components/icon';
import cx from 'classnames';

const TOOLTIP_OPEN_EVENT = 'custom-tooltip:open';

type Placement = 'top' | 'bottom' | 'left' | 'right';

interface CustomTooltipProps {
  title: string;
  content?: React.ReactNode;
  placement?: Placement;
  className?: string;
  maxWidth?: number | string;
}

const GAP = 10;
const Z_INDEX = 999999;
const arrowBase = 'w-2 h-2 bg-black rotate-45 absolute';

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  title,
  content,
  placement = 'right',
  className,
  maxWidth = 420,
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [side, setSide] = useState<Placement>(placement);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(Symbol('tooltip'));

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const clearShowTimer = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };

  const computePosition = useCallback(
    (desired: Placement) => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const approxHeight = 100;
      const width = typeof maxWidth === 'number' ? maxWidth : 420;

      let finalSide: Placement = desired;

      if (desired === 'right' && rect.right + Number(width) + GAP > vw) finalSide = 'left';
      if (desired === 'left' && rect.left - Number(width) - GAP < 0) finalSide = 'right';
      if (desired === 'top' && rect.top - approxHeight - GAP < 0) finalSide = 'bottom';
      if (desired === 'bottom' && rect.bottom + approxHeight + GAP > vh) finalSide = 'top';

      const positions = {
        right: { top: rect.top + rect.height / 2, left: rect.right + GAP },
        left: { top: rect.top + rect.height / 2, left: rect.left - GAP },
        top: { top: rect.top - GAP, left: rect.left + rect.width / 2 },
        bottom: { top: rect.bottom + GAP, left: rect.left + rect.width / 2 },
      };

      setPos(positions[finalSide]);
      setSide(finalSide);
    },
    [maxWidth]
  );

  const show = () => {
    clearHideTimer();
    clearShowTimer();
    showTimer.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(TOOLTIP_OPEN_EVENT, { detail: idRef.current }));
      computePosition(placement);
      setOpen(true);
      showTimer.current = null;
    }, 100);
  };

  const hide = () => {
    hideTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<symbol>;
      if (ce.detail !== idRef.current) {
        setOpen(false);
      }
    };
    window.addEventListener(TOOLTIP_OPEN_EVENT, handler);
    return () => window.removeEventListener(TOOLTIP_OPEN_EVENT, handler);
  }, []);

  useEffect(() => {
    const onScrollOrResize = () => {
      if (open) computePosition(side);
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, computePosition, side]);

  return (
    <span className={cx('relative inline-flex', className)}>
      <span
        ref={triggerRef}
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="inline-flex cursor-pointer"
      >
        <Icon iconName="question" svgProps={{ width: 16, height: 16 }} />
      </span>

      {open &&
        pos &&
        createPortal(
          <div
            onMouseEnter={clearHideTimer}
            onMouseLeave={hide}
            style={{
              position: 'fixed',
              zIndex: Z_INDEX,
              top: pos.top,
              left: pos.left,
              pointerEvents: 'auto',
            }}
          >
            <div
              className="relative flex flex-col bg-black text-white p-2 text-xs rounded-md shadow-lg"
              style={{
                maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
                transform:
                  side === 'top'
                    ? 'translate(-50%, -100%)'
                    : side === 'bottom'
                      ? 'translate(-50%, 0)'
                      : side === 'left'
                        ? 'translate(-100%, -50%)'
                        : 'translate(0, -50%)',
              }}
              role="tooltip"
            >
              <span className="font-bold text-sm">{title}</span>
              {content && <span className="leading-relaxed text-gray-600">{content}</span>}
              {side === 'top' && (
                <span
                  className={cx(arrowBase, 'bottom-0 left-1/2 translate-y-1/2 -translate-x-1/2')}
                />
              )}
              {side === 'bottom' && (
                <span
                  className={cx(arrowBase, 'top-0 left-1/2 -translate-y-1/2 -translate-x-1/2')}
                />
              )}
              {side === 'left' && (
                <span
                  className={cx(arrowBase, 'right-0 top-1/2 -translate-x-1/2 -translate-y-1/2')}
                />
              )}
              {side === 'right' && (
                <span
                  className={cx(arrowBase, 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2')}
                />
              )}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};

export default CustomTooltip;
