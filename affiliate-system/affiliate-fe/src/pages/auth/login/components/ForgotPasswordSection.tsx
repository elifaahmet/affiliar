import React from 'react';
import Icon from '@components/core-components/icon';
import PInput from '@components/core-components/input';

import { AuthStep } from '../types';

interface ForgotPasswordSectionProps {
  setAuthStep: (value: AuthStep) => void;
}

function ForgotPasswordSection(props: ForgotPasswordSectionProps) {
  const { setAuthStep } = props;
  return (
    <>
      <div className="flex flex-row w-full pb-4 gap-4 items-center">
        <Icon
          iconName="backIcon"
          svgProps={{ width: 34, height: 34 }}
          onClick={() => setAuthStep('login')}
        />
        <span className="text-heading-24 font-semibold text-white">Back</span>
      </div>
      <div className="w-[253px] h-32">
        <Icon iconName="affiliarDark" svgProps={{ width: 253, height: 75 }} />
      </div>
      <div className="pb-12">
        <h1 className="text-heading-20 text-white font-extrabold">Sign in to your account</h1>
      </div>

      <form className="w-full">
        <PInput
          placeholder="Email Address"
          id="password"
          type="email"
          className="w-full text-body-reg-13 h-[42px] mb-[18px]"
        />
        <button
          type="submit"
          className="bg-primary text-white font-semibold rounded-md hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2  h-[45px] w-full text-body-reg-13"
        >
          Send
        </button>
      </form>
    </>
  );
}

export default ForgotPasswordSection;
