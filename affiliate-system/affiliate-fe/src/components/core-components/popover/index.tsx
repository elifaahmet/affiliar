import React, { useLayoutEffect, useRef, useState } from 'react';

interface PopoverProps {
  onClose: () => void;
  triggerRect?: DOMRect;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

function Popover(props: PopoverProps) {
  const { onClose, triggerRect, children, className = '', style = {}, title } = props;
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    if (triggerRect && popupRef.current) {
      const popupElement = popupRef.current;
      const popupRect = popupElement.getBoundingClientRect();

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;

      let newTop = triggerRect.bottom + margin;
      let newLeft = triggerRect.left;

      if (newLeft + popupRect.width > viewportWidth) {
        newLeft = triggerRect.right - popupRect.width;
      }

      if (newLeft < 0) {
        newLeft = margin;
      }

      if (newTop + popupRect.height > viewportHeight) {
        newTop = triggerRect.top - popupRect.height - margin;
      }

      if (newTop < 0) {
        newTop = margin;
      }

      setPosition({ top: newTop, left: newLeft });
    }
  }, [triggerRect]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={popupRef}
        className={`fixed z-50 bg-[#F8F8F9] rounded px-4 py-5 border border-gray-300 ${className}`}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          boxShadow: '0px 4px 9px 0px rgba(0, 0, 0, 0.20)',
          visibility: position.top === -9999 ? 'hidden' : 'visible',
          ...style,
        }}
      >
        <div className="flex flex-col gap-3 h-full">
          <h3 className="font-extrabold">{title}</h3>
          {children}
        </div>
      </div>
    </>
  );
}

export default Popover;
