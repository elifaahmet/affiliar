import React from 'react';

interface Props {
  isActive: boolean | null;
  onToggle: () => void;
  disabled?: boolean;
}

export default function ToggleSwitch({ isActive, onToggle, disabled }: Props) {
  const passiveText =
    isActive === false ? 'text-red-500' : isActive === null ? 'text-gray-400' : 'text-gray-400';

  const activeText =
    isActive === true ? 'text-green-500' : isActive === null ? 'text-gray-400' : 'text-gray-400';

  const getPosition = () => {
    if (isActive === true) return 'right-[3px] top-1/2 -translate-y-1/2';
    if (isActive === false) return 'left-[3px] top-1/2 -translate-y-1/2';
    return 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2';
  };

  const getColor = () => {
    if (isActive === true) return 'bg-green-500';
    if (isActive === false) return 'bg-red-500';
    return 'bg-gray-400';
  };

  const getBorderColor = () => {
    if (isActive === true) return 'border-green-500';
    if (isActive === false) return 'border-red-500';
    return 'border-gray-400';
  };

  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle()}
      disabled={disabled}
      className={`flex items-center gap-3 ${
        disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span className={`text-xs font-bold ${passiveText}`}>Passive</span>

      <div
        className={`relative w-[69px] h-[26px] rounded-[5px] border transition-colors duration-300 ${getBorderColor()}`}
      >
        <span
          className={`absolute w-5 h-5 rounded-[4px] flex items-center justify-center text-xs font-bold text-white transition-all duration-300 ${getPosition()} ${getColor()}`}
        >
          III
        </span>
      </div>

      <span className={`text-xs font-bold ${activeText}`}>Active</span>
    </button>
  );
}
