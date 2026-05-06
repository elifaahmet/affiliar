import React, { ChangeEvent } from 'react';
import { FieldError } from 'react-hook-form';
import cx from 'classnames';

import Icon from '../icon';

interface PInputProps {
  id?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  className?: string;
  wrapperClassNames?: string;
  style?: React.CSSProperties;
  register?: any;
  error?: FieldError;
  label?: string;
  iconName?: string;
  onIconClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  showIcon?: boolean;
  iconSize?: string;
  rightText?: string;
  disabled?: boolean;
  height?: string;
  multiline?: boolean;
  defaultValue?: string;
  name?: string;
  iconWrapperClassName?: string;
}

const PInput: React.FC<PInputProps> = ({
  id,
  type = 'text',
  placeholder = '',
  value,
  onChange,
  required = false,
  className = '',
  wrapperClassNames = '',
  style,
  register,
  error,
  label,
  iconName,
  onIconClick,
  showIcon = false,
  rightText,
  disabled = false,
  height = 'h-10',
  iconSize = '17px',
  multiline = false,
  defaultValue,
  iconWrapperClassName = 'absolute left-4 top-1/2 transform -translate-y-1/2',
  name,
}) => {
  const inputClassNames = cx(
    `${className} bg-gray-100 border text-sm font-medium border-[#C4B5FD] ${
      multiline ? 'h-24' : height
    } rounded-md px-3 py-2 text-gray-900 placeholder:font-medium placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary`,
    {
      'border-2 border-red-500 bg-[var(--Danger-Danger-Light,#FFF1F2)]': error,
      'pl-9': showIcon,
      'pr-9': rightText,
      'bg-gray-100 border-gray-400 disabled:cursor-not-allowed disabled:opacity-50': disabled,
    }
  );

  return (
    <div className={`${wrapperClassNames} flex flex-col relative`}>
      {label && <label className="block text-sm font-medium text-gray-600">{label}</label>}

      {showIcon && iconName && (
        <div
          className={cx(iconWrapperClassName, {
            'cursor-pointer': onIconClick,
          })}
          onClick={onIconClick}
        >
          <Icon
            svgProps={{
              width: iconSize,
              height: iconSize,
            }}
            iconName={iconName}
          />
        </div>
      )}

      {multiline ? (
        <textarea
          disabled={disabled}
          style={style}
          id={id}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          required={required}
          {...(register && register(id))}
          className={`${inputClassNames} resize-none`}
          name={name}
        />
      ) : (
        <input
          disabled={disabled}
          style={style}
          type={type}
          id={id}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          className={inputClassNames}
          required={required}
          name={name}
          autoComplete="off"
          {...(register && register(id))}
        />
      )}

      {rightText && (
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-900 text-body-reg-14 font-semibold">
          {rightText}
        </div>
      )}

      {error && <p className="mt-2 text-red-500 text-body-reg-12 font-medium">{error.message}</p>}
    </div>
  );
};

export default PInput;
