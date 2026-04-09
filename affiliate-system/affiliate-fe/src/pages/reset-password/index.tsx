import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '@components/core-components/icon';
import axiosInstance from 'config/axiosInstance';

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-grayBg flex items-center justify-center p-4">
    <div className="flex items-center flex-col max-w-lg w-full my-8 py-12 px-2 justify-center rounded-[20px] bg-black space-y-6">
      {children}
    </div>
  </div>
);

const InputField = ({
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
}) => (
  <div className="space-y-1">
    <label className="block text-xs font-medium text-gray-400">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white h-[52px] text-gray-700 text-sm rounded-lg px-4 border border-gray-200 focus:outline-none focus:border-primary"
    />
  </div>
);

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

  return (
    <PageWrapper>
      <div className="flex justify-center">
        <Icon iconName="affiliar" svgProps={{ width: 280, height: 56 }} />
      </div>

      {done ? (
        <div className="text-center space-y-3">
          <div className="text-4xl">✓</div>
          <h2 className="text-white text-lg font-semibold">Password Updated</h2>
          <p className="text-gray-400 text-sm">Your password has been reset. You can now sign in.</p>
          <a
            href="/login"
            className="block w-full bg-primary text-white text-sm font-medium py-3 rounded-xl text-center hover:bg-primary/90 transition-colors mt-4"
          >
            Go to Sign In
          </a>
        </div>
      ) : (
        <>
          <div className="text-center">
            <h2 className="text-white text-xl font-semibold">Reset Your Password</h2>
            <p className="text-gray-400 text-sm mt-1">Choose a new password for your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 w-full px-8">
            <InputField
              label="New Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
            />
            <InputField
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Repeat your password"
            />

            {error && <p className="text-red-400 text-xs">{error}</p>}

            {!token && (
              <p className="text-yellow-400 text-xs">
                Invalid reset link. Please request a new password reset.
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !token}
              className="w-full bg-primary text-white text-sm font-semibold py-3 rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        </>
      )}
    </PageWrapper>
  );
}
