import React from 'react';

function Switch({
  isActive,
  onToggle,
  disabled = true,
  activeClassName,
  isLoading = false,
}: {
  isActive: boolean;
  onToggle: () => void;
  disabled?: boolean;
  activeClassName?: string;
  isLoading?: boolean;
}) {
  const isToggleDisabled = disabled || isLoading;

  return (
    <label
      className={`relative inline-flex items-center cursor-pointer ${
        isToggleDisabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      style={isToggleDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
    >
      <input
        type="checkbox"
        checked={isActive}
        className="sr-only peer"
        onChange={onToggle}
        disabled={isToggleDisabled}
      />
      <div
        className={`w-12 h-7 rounded-full transition-colors duration-300 p-1 ${
          isActive ? activeClassName || 'bg-primary' : 'bg-gray-400'
        }`}
      >
        <div
          className={`dot absolute ${
            isActive ? 'right-1' : 'left-1'
          } top-1 bg-white w-5 h-5 rounded-full shadow-md transition peer-checked:translate-x-full peer-checked:left-6 flex items-center justify-center`}
        >
          {isLoading && (
            <div className="w-3 h-3 border-2 border-t-transparent border-blue-700 rounded-full animate-spin"></div>
          )}
        </div>
      </div>
    </label>
  );
}

export default Switch;
