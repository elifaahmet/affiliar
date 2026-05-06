import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from 'store';

import ForgotPasswordSection from './components/ForgotPasswordSection';
import MainSection from './components/MainSection';
import OtpSection from './components/OtpSection';
import { AuthStep } from './types';

/**
 * Single-column form panel that lives inside AuthLayout's right side.
 * The black-background card is gone — this panel is a clean white column,
 * the editorial brand panel sits to its left in AuthLayout.
 */
const Login = () => {
  const [authStep, setAuthStep] = useState<AuthStep>('login');
  const { twoFactorRequired } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (twoFactorRequired) {
      setAuthStep('otp');
    }
  }, [twoFactorRequired, authStep]);

  return (
    <div className="flex w-full max-w-md flex-col">
      {authStep === 'login' && <MainSection setAuthStep={setAuthStep} />}
      {authStep === 'forgotPassword' && <ForgotPasswordSection setAuthStep={setAuthStep} />}
      {authStep === 'otp' && <OtpSection />}
    </div>
  );
};

export default Login;
