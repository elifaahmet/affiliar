import React, { useState, type FormEvent } from 'react';
import Icon from '@components/core-components/icon';
import PInput from '@components/core-components/input';
import axiosInstance from 'config/axiosInstance';

import { AuthStep } from '../types';

interface ForgotPasswordSectionProps {
  setAuthStep: (value: AuthStep) => void;
}

function ForgotPasswordSection(props: ForgotPasswordSectionProps) {
  const { setAuthStep } = props;
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement)?.value?.trim();
    if (!email) return;

    setError(null);
    setSubmitting(true);
    try {
      await axiosInstance.post('auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

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
        <Icon iconName="affiliar" svgProps={{ width: 253, height: 75 }} />
      </div>
      <div className="pb-12">
        <h1 className="text-heading-20 text-white font-extrabold">Forgot your password?</h1>
        <p className="text-body-reg-13 text-white/70 mt-2">
          Enter your email and we'll send you a reset link.
        </p>
      </div>

      {submitted ? (
        <div className="bg-white/10 border border-white/20 rounded-lg p-4 text-white text-body-reg-13">
          If an account exists for that email, a reset link has been sent. Check your inbox.
        </div>
      ) : (
        <form className="w-full" onSubmit={handleSubmit}>
          <PInput
            placeholder="Email Address"
            id="email"
            name="email"
            type="email"
            required
            className="w-full text-body-reg-13 h-[42px] mb-[18px]"
          />
          {error && <p className="text-red-400 text-body-reg-13 mb-2">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-white font-semibold rounded-md hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 h-[45px] w-full text-body-reg-13 disabled:opacity-60"
          >
            {submitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}
    </>
  );
}

export default ForgotPasswordSection;
