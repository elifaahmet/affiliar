import React, { useState, type FormEvent } from 'react';
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
    const identifier = (form.elements.namedItem('identifier') as HTMLInputElement)?.value?.trim();
    if (!identifier) return;

    setError(null);
    setSubmitting(true);
    try {
      await axiosInstance.post('auth/forgot-password', { identifier });
      setSubmitted(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setAuthStep('login')}
        className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900"
      >
        <span aria-hidden>←</span> Back to sign in
      </button>

      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-600 mb-3">
          Account recovery
        </p>
        <h1 className="font-display text-4xl leading-tight tracking-tight text-gray-900">
          Forgot your <span className="italic text-primary">password</span>?
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          Enter the username or email you sign in with and we&apos;ll send a reset link to the account&apos;s email address.
        </p>
      </div>

      {submitted ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          If an account exists, a reset link is on its way to its email address. Check your inbox.
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="identifier" className="mb-1.5 block text-xs font-semibold text-gray-700">
              Username or email
            </label>
            <PInput
              placeholder="yourname or you@operator.com"
              id="identifier"
              name="identifier"
              type="text"
              required
              className="w-full bg-white h-[44px]"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex h-[46px] w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </div>
  );
}

export default ForgotPasswordSection;
