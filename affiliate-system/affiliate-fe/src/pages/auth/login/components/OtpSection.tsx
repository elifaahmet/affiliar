import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
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
    <div className="flex flex-col">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-600 mb-3">
          Two-factor authentication
        </p>
        <h1 className="font-display text-4xl leading-tight tracking-tight text-gray-900">
          Verify it&apos;s <span className="italic text-primary">you</span>.
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          {showQrCode
            ? 'Scan the QR code with your authenticator app, then enter the 6-digit code below.'
            : 'Open Google Authenticator on your phone and enter the 6-digit code.'}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleOtpSubmit();
        }}
        className="flex flex-col gap-6"
      >
        <div>
          <div className="grid grid-cols-6 gap-3">
            {otpValues.map((value, index) => (
              <input
                key={index}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="•"
                pattern="\d{1}"
                maxLength={1}
                className="aspect-square min-w-0 rounded-lg border border-gray-200 bg-white text-center text-2xl font-semibold text-gray-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 otp-input"
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
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={!allFieldsFilled || loading}
          className="inline-flex h-[46px] w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        >
          {loading ? 'Verifying…' : 'Confirm'}
        </button>
      </form>

      {showQrCode && !isQRcodePopupOpen && (
        <button
          type="button"
          onClick={() => setIsQRcodePopupOpen(true)}
          className="mt-6 self-start text-xs font-medium text-primary hover:text-primary-dark"
        >
          Open QR Code →
        </button>
      )}

      <QRcodePopup
        isOpen={isQRcodePopupOpen}
        onClose={() => setIsQRcodePopupOpen(false)}
        qrCodeImage={qrCodeImage}
        twoFactorSetupSecret={twoFactorSetupSecret}
        loading={loading}
        error={error}
      />
    </div>
  );
}

export default OtpSection;
