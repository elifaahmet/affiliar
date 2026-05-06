import React from 'react';
import { FieldError } from 'react-hook-form';
import PhoneInput from 'react-phone-input-2';

import 'react-phone-input-2/lib/style.css';

interface CustomPhoneInputProps {
  phone: string;
  setPhone: (value: string, countryCode: string, full: string) => void;
  error?: FieldError;
  disabled?: boolean;
}

const CustomPhoneInput: React.FC<CustomPhoneInputProps> = ({
  phone,
  setPhone,
  error,
  disabled,
}) => {
  // const [inputValue, setInputValue] = useState('');
  return (
    <div className={`custom-phone-input flex items-center w-full`}>
      <div className={`flag-selector w-full ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <PhoneInput
          country={'in'}
          value={phone}
          disabled={disabled}
          onChange={(value: string, countryData: any) => {
            setPhone(
              value.replace(`+${countryData.dialCode}`, '').trim(),
              countryData.dialCode,
              value
            );
            // setInputValue(value);
          }}
          enableSearch={true}
          containerStyle={{ width: '100%', background: 'transparent' }}
          inputStyle={{
            width: 'calc(100% - 60px)',
            height: '40px',
            borderRadius: '6px',
            background: disabled ? '#fcfcfc' : '#fdfeff',
            border: disabled ? '1px solid #d4d9e6' : '1px solid #C4B5FD',
            paddingLeft: '10px',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          buttonStyle={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: disabled ? '1px solid #d4d9e6' : '1px solid #C4B5FD',
            borderRadius: '6px',
            marginRight: '10px',
            background: disabled ? '#fcfcfc' : '#fdfeff',
            width: '50px',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          dropdownStyle={{
            zIndex: 1000,
            border: '1px solid #ccc',
            background: '#fdfeff',
            borderRadius: '6px',
          }}
        />
        {error && <div className="text-red-500 text-xs mt-2">{error.message}</div>}
      </div>
    </div>
  );
};

export default CustomPhoneInput;
