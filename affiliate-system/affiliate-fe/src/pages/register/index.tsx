import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '@components/core-components/icon';
import axiosInstance from 'config/axiosInstance';
import { AFFILIATES_API_URLS } from 'config/apiUrls';

interface FormState {
  name: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  mobileCountryCode: string;
  mobileNumber: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  mobileCountryCode: '',
  mobileNumber: '',
};

const inputClass =
  'w-full bg-white h-[44px] border border-gray-200 rounded-lg px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors';
const labelClass = 'mb-1.5 block text-xs font-semibold text-gray-700';

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        {required && ' *'}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={inputClass}
      />
    </div>
  );
}

function AffiliateRegister() {
  const [searchParams] = useSearchParams();
  const operatorId = searchParams.get('operatorId');
  const parentCode = searchParams.get('parentCode');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ affiliateCode: string } | null>(null);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await axiosInstance.post(AFFILIATES_API_URLS.REGISTER(), {
        operatorId: operatorId || undefined,
        parentCode: parentCode || undefined,
        name: form.name,
        email: form.email,
        username: form.username,
        password: form.password,
        mobileCountryCode: form.mobileCountryCode || undefined,
        mobileNumber: form.mobileNumber || undefined,
      });
      setSuccess({ affiliateCode: res.data.affiliateCode });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Invalid invite ──────────────────────────────────────────────────────
  if (!operatorId && !parentCode) {
    return (
      <div className="flex w-full max-w-md flex-col">
        <MobileLogo />
        <Eyebrow>Invite required</Eyebrow>
        <Headline>
          Your invite link looks <span className="italic text-primary">incomplete</span>.
        </Headline>
        <p className="mt-3 text-sm text-gray-500">
          Operator and referrer information is missing. Please request a new link from your
          operator and try again.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex h-[46px] items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex w-full max-w-md flex-col">
        <MobileLogo />
        <Eyebrow>You&apos;re in</Eyebrow>
        <Headline>
          Welcome to <span className="italic text-primary">Affiliar</span>.
        </Headline>
        <p className="mt-3 text-sm text-gray-500">
          Your affiliate account is ready. Save the code below — it tracks every player you refer.
        </p>

        <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 mb-2">
            Your affiliate code
          </p>
          <p className="font-mono text-3xl font-semibold tracking-[0.2em] text-gray-900">
            {success.affiliateCode}
          </p>
        </div>

        <Link
          to="/"
          className="mt-6 inline-flex h-[46px] items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full max-w-md flex-col">
      <MobileLogo />
      <Eyebrow>Affiliate sign-up</Eyebrow>
      <Headline>
        Create your <span className="italic text-primary">workspace</span>.
      </Headline>
      <p className="mt-3 text-sm text-gray-500">
        You&apos;ve been invited to join as an affiliate. Set up your account to get your
        referral code and start tracking commissions.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Field
          label="Full name"
          value={form.name}
          onChange={set('name')}
          placeholder="Jane Doe"
          required
        />
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="jane@example.com"
          required
        />
        <Field
          label="Username"
          value={form.username}
          onChange={set('username')}
          placeholder="janedoe"
          required
        />

        <div className="flex gap-3">
          <div className="w-28">
            <label className={labelClass}>Country code</label>
            <input
              type="text"
              value={form.mobileCountryCode}
              onChange={set('mobileCountryCode')}
              placeholder="+49"
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>Phone number</label>
            <input
              type="tel"
              value={form.mobileNumber}
              onChange={set('mobileNumber')}
              placeholder="171 234 5678"
              className={inputClass}
            />
          </div>
        </div>

        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          placeholder="Min. 8 characters"
          required
        />
        <Field
          label="Confirm password"
          type="password"
          value={form.confirmPassword}
          onChange={set('confirmPassword')}
          placeholder="Repeat password"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="mt-3 inline-flex h-[46px] w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-xs text-gray-400">
        Already have an account?{' '}
        <Link to="/" className="font-medium text-gray-700 hover:text-gray-900">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}

// ── Shared building blocks ────────────────────────────────────────────────

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

export default AffiliateRegister;
