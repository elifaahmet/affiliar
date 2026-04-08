import React from 'react';

import Icon from '../icon';

interface CheckBoxProps {
  classNames?: string;
  onChange?: () => void;
  checked: boolean;
  disabled?: boolean;
}

const Checkbox: React.FC<CheckBoxProps> = ({
  onChange,
  classNames = '',
  checked,
  disabled = false,
}) => {
  return (
    <div className={`flex flex-row items-center ${classNames}`}>
      <input
        type="checkbox"
        onChange={onChange}
        checked={checked}
        disabled={disabled}
        className="hidden" // Hide the default checkbox input
      />
      <span
        className={`cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={onChange}
      >
        {checked ? (
          <Icon
            iconName="blueCheckbox"
            svgProps={{
              width: 27,
              height: 26,
            }}
          />
        ) : (
          <Icon
            svgProps={{
              width: 27,
              height: 26,
            }}
            iconName="unCheckedbox"
          />
        )}
      </span>
    </div>
  );
};

export default Checkbox;
