import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const inputClass = 'w-full bg-white h-[42px] border border-gray-200 rounded-lg px-3 text-sm text-gray-700 focus:outline-none focus:border-primary';
const labelClass = 'block text-xs font-medium text-gray-400 mb-1';

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
      <label className={labelClass}>{label}{required && ' *'}</label>
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

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className='min-h-screen bg-grayBg flex items-center justify-center p-4'>
      <div className='flex items-center flex-col max-w-lg w-full my-8 py-12 p-8 justify-center rounded-[20px] bg-black'>
        <div className='w-[253px] h-32 flex items-center justify-center'>
          <Icon iconName='affiliar' svgProps={{ width: 280, height: 56 }} />
        </div>
        {children}
      </div>
    </div>
  );
}

function AffiliateRegister() {
  const [searchParams] = useSearchParams();
  const operatorId  = searchParams.get('operatorId');
  const parentCode  = searchParams.get('parentCode');

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
        operatorId:        operatorId  || undefined,
        parentCode:        parentCode  || undefined,
        name:              form.name,
        email:             form.email,
        username:          form.username,
        password:          form.password,
        mobileCountryCode: form.mobileCountryCode || undefined,
        mobileNumber:      form.mobileNumber      || undefined,
      });
      setSuccess({ affiliateCode: res.data.affiliateCode });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!operatorId && !parentCode) {
    return (
      <PageWrapper>
        <p className='text-red-400 text-sm text-center mt-4'>
          Invalid invite link. Please request a new one from your operator.
        </p>
      </PageWrapper>
    );
  }

  if (success) {
    return (
      <PageWrapper>
        <div className='text-center space-y-4 mt-4 w-full max-w-sm'>
          <div className='w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto'>
            <svg className='w-6 h-6 text-green-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
            </svg>
          </div>
          <h2 className='text-heading-20 text-white font-extrabold'>Registration complete!</h2>
          <p className='text-sm text-gray-400'>Your affiliate account has been created.</p>
          <div className='bg-white/10 border border-white/20 rounded-lg p-4 mt-2'>
            <p className='text-xs text-gray-400 mb-1'>Your affiliate code</p>
            <p className='text-2xl font-mono font-bold text-white tracking-widest'>{success.affiliateCode}</p>
          </div>
          <p className='text-xs text-gray-500'>Save this code &mdash; use it to track your referrals.</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className='pb-8 text-center'>
        <h1 className='text-heading-20 text-white font-extrabold'>Create affiliate account</h1>
        <p className='text-sm text-gray-400 mt-1'>You&apos;ve been invited to join as an affiliate.</p>
      </div>

      {error && (
        <div className='w-full max-w-96 mb-4'>
          <p className='text-sm text-red-400 text-center'>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className='w-full max-w-96 space-y-3'>
        <Field label='Full name' value={form.name} onChange={set('name')} placeholder='Jane Doe' required />
        <Field label='Email' type='email' value={form.email} onChange={set('email')} placeholder='jane@example.com' required />
        <Field label='Username' value={form.username} onChange={set('username')} placeholder='janedoe' required />

        <div className='flex gap-3'>
          <div className='w-28'>
            <label className={labelClass}>Country code</label>
            <input
              type='text'
              value={form.mobileCountryCode}
              onChange={set('mobileCountryCode')}
              placeholder='+49'
              className={inputClass}
            />
          </div>
          <div className='flex-1'>
            <label className={labelClass}>Phone number</label>
            <input
              type='tel'
              value={form.mobileNumber}
              onChange={set('mobileNumber')}
              placeholder='171 234 5678'
              className={inputClass}
            />
          </div>
        </div>

        <Field label='Password' type='password' value={form.password} onChange={set('password')} placeholder='Min. 8 characters' required />
        <Field label='Confirm password' type='password' value={form.confirmPassword} onChange={set('confirmPassword')} placeholder='Repeat password' required />

        <button
          type='submit'
          disabled={loading}
          className='bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 h-[45px] w-full text-sm disabled:opacity-60 mt-2'
        >
          {loading ? 'Creating account...' : 'CREATE ACCOUNT'}
        </button>
      </form>
    </PageWrapper>
  );
}

export default AffiliateRegister;
