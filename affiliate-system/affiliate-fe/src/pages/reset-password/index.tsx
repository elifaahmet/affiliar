import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '@components/core-components/icon';
import axiosInstance from 'config/axiosInstance';

const inputClass =
  'w-full bg-white h-[44px] border border-gray-200 rounded-lg px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors';

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Invalid reset link — token is missing');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      await axiosInstance.post('auth/reset-password', { token, password });
      setDone(true);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : 'Reset failed');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col">
        <MobileLogo />
        <Eyebrow>Password updated</Eyebrow>
        <Headline>
          You&apos;re all <span className="italic text-primary">set</span>.
        </Headline>
        <p className="mt-3 text-sm text-gray-500">
          Your password has been reset. You can now sign in with the new one.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex h-[46px] items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <MobileLogo />
      <Eyebrow>Account recovery</Eyebrow>
      <Headline>
        Choose a new <span className="italic text-primary">password</span>.
      </Headline>
      <p className="mt-3 text-sm text-gray-500">
        Pick something you don&apos;t use anywhere else. At least 8 characters.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
        />
        <Field
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Repeat password"
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        {!token && (
          <p className="text-sm text-yellow-700">
            Invalid reset link. Please request a new password reset email.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !token}
          className="mt-2 inline-flex h-[46px] w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        >
          {submitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}

function MobileLogo() {
  return (
    <div className="lg:hidden mb-10">
      <Icon iconName="affiliarDark" svgProps={{ width: 130, height: 28 }} />
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
      {children}
    </p>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-4xl leading-tight tracking-tight text-gray-900">
      {children}
    </h1>
  );
}
