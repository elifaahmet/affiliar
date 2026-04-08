import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import Icon from '@components/core-components/icon';
import { unwrapResult } from '@reduxjs/toolkit';
import { useAppDispatch } from 'hooks/redux';
import { RootState } from 'store';
import { generateTwoFactorQr, verifyTwoFactor } from 'store/auth/authenticationSlice';

import QRcodePopup from './QRcodePopup';

function OtpSection() {
  const [otpValues, setOtpValues] = useState<string[]>(new Array(6).fill(''));
  const dispatch = useAppDispatch();
  const {
    userId,
    // email,
    loading,
    error,
    showQrCode,
    qrCodeImage,
    twoFactorSetupSecret,
    // isAuthenticated,
  } = useSelector((state: RootState) => state.auth);

  const [isQRcodePopupOpen, setIsQRcodePopupOpen] = useState(showQrCode);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  useEffect(() => {
    if (showQrCode && userId && !qrCodeImage && !loading) {
      dispatch(generateTwoFactorQr(userId));
      setIsQRcodePopupOpen(true);
    }
  }, [showQrCode, userId, qrCodeImage, loading, dispatch]);

  const handleChange = (
    index: number,
    value: string,
    event: React.ChangeEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (/^\d*$/.test(value)) {
      const newOtpValues = [...otpValues];
      newOtpValues[index] = value;
      setOtpValues(newOtpValues);

      if (value && inputRefs.current[index + 1]) {
        inputRefs.current[index + 1]?.focus();
      } else if (
        !value &&
        'key' in event &&
        event.key === 'Backspace' &&
        inputRefs.current[index - 1]
      ) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleOtpSubmit = React.useCallback(async () => {
    const otpCode = otpValues.join('');

    if (otpCode.length === 6 && userId) {
      try {
        const resultAction = await dispatch(
          verifyTwoFactor({
            userId,
            otpCode,
            setupComplete: showQrCode,
          })
        );
        unwrapResult(resultAction);
      } catch (err: any) {
        console.error('Failed to verify OTP:', err);
      }
    }
  }, [otpValues, userId, dispatch, showQrCode]);

  useEffect(() => {
    const otpCode = otpValues.join('');
    if (otpCode.length === 6 && otpValues.every((val) => val !== '')) {
      handleOtpSubmit();
    }
  }, [otpValues, handleOtpSubmit]);

  const allFieldsFilled = otpValues.every((value) => value !== '' && value.length === 1);

  return (
    <>
      <div className="h-full w-full">
        <div className="mb-16">
          <Icon iconName="pixupplay" svgProps={{ width: 142, height: 42 }} />
        </div>
        <div className="flex flex-col gap-4 text-center">
          <h1 className="text-heading-20 text-white font-extrabold">Two-Factor Authentication</h1>
          <h4 className="text-gray-400">
            {showQrCode ? (
              <>
                To set up 2FA, please scan the QR code that appears, then enter the code from your
                authenticator app.
              </>
            ) : (
              <>Open the Google Authenticator app on your phone and enter the generated code.</>
            )}
          </h4>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleOtpSubmit();
          }}
          className="flex flex-col gap-6"
        >
          <div>
            <div className="grid grid-cols-6 gap-4 mt-8 justify-center">
              {otpValues.map((value, index) => (
                <input
                  key={index}
                  // type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="▪"
                  pattern="\d{1}"
                  maxLength={1}
                  className="aspect-square min-w-0 text-center text-lg rounded-md bg-white text-black border border-gray-400 otp-input"
                  value={value}
                  onChange={(e) => {
                    const inputType = (e.nativeEvent as InputEvent).inputType;
                    if (inputType !== 'deleteContentBackward') {
                      handleChange(index, e.target.value, e);
                    }
                  }}
                  onKeyDown={(e) => e.key !== 'Enter' && handleChange(index, '', e)}
                  ref={(el) => (inputRefs.current[index] = el)}
                />
              ))}
            </div>
            {error && (
              <p className="mt-2 text-red-500 text-body-reg-12 font-medium text-left">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!allFieldsFilled || loading}
            className="bg-primary text-white font-bold rounded-lg uppercase  hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 h-[45px] w-full text-sm"
          >
            {loading ? 'Verifying...' : 'Confirm'}
          </button>
        </form>
        <div className="mt-10 text-center">
          {showQrCode && !isQRcodePopupOpen && (
            <button
              type="button"
              onClick={() => setIsQRcodePopupOpen(true)}
              className="text-primary text-sm font-semibold underline hover:opacity-80 transition-opacity"
            >
              Open QR Code
            </button>
          )}
        </div>
      </div>
      <QRcodePopup
        isOpen={isQRcodePopupOpen}
        onClose={() => setIsQRcodePopupOpen(false)}
        qrCodeImage={qrCodeImage}
        twoFactorSetupSecret={twoFactorSetupSecret}
        loading={loading}
        error={error}
      />
    </>
  );
}

export default OtpSection;
