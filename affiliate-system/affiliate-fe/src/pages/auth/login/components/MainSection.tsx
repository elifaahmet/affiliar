import React from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import Icon from '@components/core-components/icon';
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
    <>
      <div className="w-[253px] h-32">
        <Icon iconName="affiliar" svgProps={{ width: 280, height: 56 }} />
      </div>
      <div className="pb-12">
        <h1 className="text-heading-20 text-white font-extrabold">Sign in to your account</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-96">
        <PInput
          placeholder="Username or Email Address"
          id="identifier"
          type="text"
          register={register}
          error={errors.identifier}
          className="w-full bg-white h-[42px]"
        />
        <PInput
          placeholder="Password"
          id="password"
          type="password"
          register={register}
          error={errors.password}
          className="w-full bg-white h-[42px] mt-3"
        />
        {!errors.password && !errors.identifier && authError && (
          <p className="mt-2 text-red-500 text-body-reg-12 font-medium">{authError}</p>
        )}

        <div className="flex justify-end w-full">
          <button
            type="button"
            className="text-primary font-bold text-body-reg-14 my-6"
            onClick={() => setAuthStep('forgotPassword')}
          >
            Forgot password
          </button>
        </div>
        <button
          onClick={handleSubmit(onSubmit)}
          type="submit"
          className="bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 h-[45px] w-full text-sm"
        >
          SIGN IN
        </button>
      </form>
    </>
  );
}

export default MainSection;
