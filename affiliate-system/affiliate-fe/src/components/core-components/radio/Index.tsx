import React from 'react';

interface RadioProps {
  onChange?: () => void;
  checked: boolean;
  disabled?: boolean;
  name?: string; // Dinamik name desteği
}

const Radio: React.FC<RadioProps> = ({ onChange, checked, name, disabled = false }) => {
  return (
    <div className="flex flex-row gap-4 items-center">
      <input
        type="radio"
        name={name}
        className="hidden"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className={`w-[26px] h-[26px] rounded-full border-2 flex items-center justify-center cursor-pointer 
          ${checked ? 'bg-primary border-primary' : 'bg-gray-400 border-gray-400'}
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        onClick={!disabled ? onChange : undefined}
      >
        {checked && <span className="w-3.5 h-3.5 rounded-full bg-white"></span>}
      </span>
    </div>
  );
};

export default Radio;
