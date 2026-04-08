import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { AFFILIATES_API_URLS } from 'config/apiUrls';
import Icon from '@components/core-components/icon';

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

export default function Activate() {
  const [params] = useSearchParams();
  const userId = params.get('userId') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const { mutate, isPending } = useBaseMutation({
    endpoint: AFFILIATES_API_URLS.ACTIVATE(),
    method: 'post',
    onSuccess: () => setDone(true),
    onError: (e: any) => setError(e?.response?.data?.error ?? e?.message ?? 'Activation failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!userId) {
      setError('Invalid activation link — userId is missing');
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
    mutate({ userId, password });
  };

  return (
    <PageWrapper>
      <div className="flex justify-center">
        <Icon iconName="affiliarDark" svgProps={{ width: 280, height: 56 }} />
      </div>

      {done ? (
        <div className="text-center space-y-3">
          <div className="text-4xl">✓</div>
          <h2 className="text-white text-lg font-semibold">Account Activated</h2>
          <p className="text-gray-400 text-sm">Your password has been set. You can now sign in.</p>
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
            <h2 className="text-white text-xl font-semibold">Set Your Password</h2>
            <p className="text-gray-400 text-sm mt-1">Choose a password to activate your account</p>
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

            {!userId && (
              <p className="text-yellow-400 text-xs">
                Invalid activation link. Please contact your operator.
              </p>
            )}

            <button
              type="submit"
              disabled={isPending || !userId}
              className="w-full bg-primary text-white text-sm font-semibold py-3 rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isPending ? 'Activating...' : 'Activate Account'}
            </button>
          </form>
        </>
      )}
    </PageWrapper>
  );
}
