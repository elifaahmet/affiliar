import React from 'react';

export type HeaderAlign = 'left' | 'center' | 'right';

export interface HeaderWithSubtitleProps {
  title?: string;
  subtitle?: string;
  align?: HeaderAlign;
  className?: string;
}

const HeaderWithSubtitle: React.FC<HeaderWithSubtitleProps> = ({
  title,
  subtitle,
  align = 'left',
  className = '',
}) => {
  const alignmentClass =
    align === 'center'
      ? 'items-center text-center'
      : align === 'right'
        ? 'items-end text-right'
        : 'items-start text-left';

  return (
    <div className={`flex flex-col ${alignmentClass} w-full leading-tight py-1 ${className}`}>
      {title ? (
        <span className="text-sm font-semibold text-gray-900 leading-none">{title}</span>
      ) : null}
      {subtitle ? <span className="text-xs text-gray-600">{subtitle}</span> : null}
    </div>
  );
};

export default HeaderWithSubtitle;
