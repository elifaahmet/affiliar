import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from 'store';

import ForgotPasswordSection from './components/ForgotPasswordSection';
import MainSection from './components/MainSection';
import OtpSection from './components/OtpSection';
import { AuthStep } from './types';

const Login = () => {
  const [authStep, setAuthStep] = useState<AuthStep>('login');
  const { twoFactorRequired } = useSelector((state: RootState) => state.auth);
  useEffect(() => {
    if (twoFactorRequired) {
      setAuthStep('otp');
    } else if (authStep === 'otp' && !twoFactorRequired) {
      // 2FA no longer required. User should be authenticated.
    }
  }, [twoFactorRequired, authStep]);
  return (
    <div
      className={`flex items-center flex-col max-w-full lg:max-w-lg 2xl:max-w-[640px] w-full my-8 py-12 lg:my-[66px] ${
        authStep === 'otp' ? 'lg:py-12' : 'lg:py-24'
      } p-4 lg:p-8 justify-center rounded-[20px] bg-black order-1 lg:order-2`}
    >
      {authStep === 'login' && <MainSection setAuthStep={setAuthStep} />}
      {authStep === 'forgotPassword' && <ForgotPasswordSection setAuthStep={setAuthStep} />}
      {authStep === 'otp' && <OtpSection />}
    </div>
  );
};

export default Login;
