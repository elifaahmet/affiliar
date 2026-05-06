import React from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import PInput from '@components/core-components/input';
import { yupResolver } from '@hookform/resolvers/yup';
import { useAppDispatch } from 'hooks/redux';
import { RootState } from 'store';
import { authenticationLogin } from 'store/auth/authenticationSlice';
import * as yup from 'yup';

import { AuthStep } from '../types';

const schema = yup.object().shape({
  identifier: yup.string().required('You must enter a username or email address'),
  password: yup.string().required('You entered an incorrect password'),
});

interface IFormInput {
  password: string;
  identifier: string;
}

interface ForgotPasswordSectionProps {
  setAuthStep: (value: AuthStep) => void;
}

function MainSection(props: ForgotPasswordSectionProps) {
  const { setAuthStep } = props;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IFormInput>({
    resolver: yupResolver(schema),
  });
  const dispatch = useAppDispatch();
  const authError = useSelector((state: RootState) => state.auth.error);

  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars
    const datas = await dispatch(authenticationLogin(data));
  };

  return (
    <div className="flex flex-col">
      {/* Mobile-only logo (the desktop hero panel handles this on lg+) */}
      <div className="lg:hidden mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white font-bold">
          A
        </div>
        <span className="text-lg font-semibold text-gray-900">Affiliar</span>
      </div>

      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400 mb-3">
          Welcome back
        </p>
        <h1 className="font-display text-4xl leading-tight tracking-tight text-gray-900">
          Sign in to your <span className="italic text-primary">workspace</span>.
        </h1>
        <p className="mt-3 text-sm text-gray-500">
          Use your operator credentials to access affiliate reports, commissions and payouts.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="identifier"
            className="mb-1.5 block text-xs font-semibold text-gray-700"
          >
            Username or email
          </label>
          <PInput
            placeholder="you@operator.com"
            id="identifier"
            type="text"
            register={register}
            error={errors.identifier}
            className="w-full bg-white h-[44px]"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-xs font-semibold text-gray-700">
              Password
            </label>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:text-primary-dark"
              onClick={() => setAuthStep('forgotPassword')}
            >
              Forgot password?
            </button>
          </div>
          <PInput
            placeholder="••••••••"
            id="password"
            type="password"
            register={register}
            error={errors.password}
            className="w-full bg-white h-[44px]"
          />
        </div>

        {!errors.password && !errors.identifier && authError && (
          <p className="text-sm text-danger">{authError}</p>
        )}

        <button
          onClick={handleSubmit(onSubmit)}
          type="submit"
          className="mt-2 inline-flex h-[46px] w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          Sign in
        </button>
      </form>

      <p className="mt-8 text-xs text-gray-400">
        Need an Affiliar account for your operation?{' '}
        <a href="mailto:hello@affiliar.co" className="font-medium text-gray-700 hover:text-gray-900">
          Get in touch
        </a>
        .
      </p>
    </div>
  );
}

export default MainSection;
