import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { AFFILIATES_API_URLS } from 'config/apiUrls';
import Icon from '@components/core-components/icon';

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
    onError: (e: any) =>
      setError(e?.response?.data?.error ?? e?.message ?? 'Activation failed'),
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

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col">
        <MobileLogo />
        <Eyebrow>Account activated</Eyebrow>
        <Headline>
          You&apos;re ready to <span className="italic text-primary">sign in</span>.
        </Headline>
        <p className="mt-3 text-sm text-gray-500">
          Your password has been set. Use it next time you sign in to your workspace.
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
      <Eyebrow>Account activation</Eyebrow>
      <Headline>
        Set your <span className="italic text-primary">password</span>.
      </Headline>
      <p className="mt-3 text-sm text-gray-500">
        Choose a password to activate your account. At least 8 characters.
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

        {!userId && (
          <p className="text-sm text-yellow-700">
            Invalid activation link. Please contact your operator for a new one.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !userId}
          className="mt-2 inline-flex h-[46px] w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        >
          {isPending ? 'Activating…' : 'Activate account'}
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
