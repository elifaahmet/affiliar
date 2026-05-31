import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { PLATFORM_ADMIN_API_URLS } from 'config/apiUrls';

const PLAN_OPTIONS = [
  { key: 'tier1',   label: '1-Tier — $53/mo' },
  { key: 'tier2',   label: '1+2 Tier — $98/mo' },
  { key: 'plus',    label: 'Affiliate Plus — $494/mo' },
  { key: 'plusL2',  label: 'Plus L2 — $998/mo' },
  { key: 'pro',     label: 'Pro — $1799/mo' },
];

interface CreateOperatorResponse {
  operator: {
    _id: string;
    name: string;
    plan: string;
    activeDiscountCode: string;
  };
  owner: { _id: string; email: string };
  brand: { _id: string; name: string };
  activationUrl: string;
}

export default function PlatformOperatorsNew() {
  const navigate = useNavigate();
  const [name, setName]                           = useState('');
  const [ownerName, setOwnerName]                 = useState('');
  const [ownerEmail, setOwnerEmail]               = useState('');
  const [ownerUsername, setOwnerUsername]         = useState('');
  const [plan, setPlan]                           = useState('tier1');
  const [activeDiscountCode, setActiveDiscountCode] = useState('');
  const [brandName, setBrandName]                 = useState('');
  const [brandUrl, setBrandUrl]                   = useState('');
  const [error, setError]                         = useState<string | null>(null);
  const [result, setResult]                       = useState<CreateOperatorResponse | null>(null);

  const mutation = useBaseMutation<CreateOperatorResponse, Record<string, unknown>>({
    endpoint: PLATFORM_ADMIN_API_URLS.CREATE_OPERATOR(),
    method: 'post',
    invalidateKeys: ['platform-operators'],
    onSuccess: (res) => setResult(res),
    onError: (e: any) => setError(e?.response?.data?.error ?? e?.message ?? 'Failed to create operator'),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    mutation.mutate({
      name: name.trim(),
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim(),
      ownerUsername: ownerUsername.trim(),
      plan,
      activeDiscountCode: activeDiscountCode.trim() || undefined,
      brandName: brandName.trim(),
      brandUrl: brandUrl.trim() || undefined,
    });
  };

  if (result) {
    return (
      <div className='h-full overflow-auto p-6 pb-24'>
        <div className='max-w-2xl space-y-6'>
          <div>
            <h1 className='text-lg font-semibold text-gray-900'>Operator created</h1>
            <p className='text-xs text-gray-600 mt-0.5'>
              An activation email was sent to <b>{result.owner.email}</b>. They set their password
              via the link below; until then their account stays in <code>pending</code>.
            </p>
          </div>

          <div className='rounded-xl border border-violet-100 bg-white px-5 py-4 space-y-2 text-sm'>
            <div><span className='text-gray-600'>Operator:</span> <b>{result.operator.name}</b></div>
            <div><span className='text-gray-600'>Plan:</span> {result.operator.plan}</div>
            {result.operator.activeDiscountCode && (
              <div><span className='text-gray-600'>Discount:</span> <code className='bg-violet-50 px-1 rounded'>{result.operator.activeDiscountCode}</code></div>
            )}
            <div><span className='text-gray-600'>First brand:</span> {result.brand.name}</div>
            <div className='pt-2 border-t border-gray-100'>
              <span className='text-gray-600'>Activation URL:</span>
              <p className='font-mono text-xs break-all text-violet-700 mt-1'>{result.activationUrl}</p>
            </div>
          </div>

          <div className='flex gap-2'>
            <Link
              to='/platform/operators'
              className='rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'
            >
              Back to list
            </Link>
            <button
              type='button'
              onClick={() => navigate(0)}
              className='rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark'
            >
              Onboard another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='h-full overflow-auto p-6 pb-24'>
      <div className='max-w-2xl'>
        <div className='mb-6'>
          <Link to='/platform/operators' className='text-xs text-primary hover:underline'>
            ← Back to operators
          </Link>
          <h1 className='text-lg font-semibold text-gray-900 mt-2'>New Operator</h1>
          <p className='text-xs text-gray-600 mt-0.5'>
            Creates the operator account, owner user (pending until activation), one default brand,
            and seeds operator-default fee settings. Owner receives an activation email.
          </p>
          <p className='text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5'>
            No trial period — the operator starts in <code>past_due</code> and must pay before
            their status becomes <code>active</code>. If a discount code is set above, it auto-
            applies on first checkout.
          </p>
        </div>

        <form onSubmit={onSubmit} className='space-y-5 bg-white rounded-xl border border-violet-100 p-6'>
          <Section title='Operator'>
            <Field label='Name *' value={name} onChange={setName} placeholder='Betamericano' required />
            <SelectField label='Plan' value={plan} onChange={setPlan} options={PLAN_OPTIONS} />
            <Field
              label='Active discount code (optional)'
              value={activeDiscountCode}
              onChange={(v) => setActiveDiscountCode(v.toUpperCase())}
              placeholder='BETAMERICANO200'
              hint='Saved on the operator. Auto-applied on every billing cycle until removed.'
              monospace
            />
          </Section>

          <Section title='Owner user'>
            <Field label='Name *' value={ownerName} onChange={setOwnerName} placeholder='Jane Doe' required />
            <Field label='Email *' value={ownerEmail} onChange={setOwnerEmail} placeholder='jane@betamericano.com' type='email' required />
            <Field label='Username *' value={ownerUsername} onChange={setOwnerUsername} placeholder='janedoe' required />
          </Section>

          <Section title='First brand'>
            <Field label='Brand name *' value={brandName} onChange={setBrandName} placeholder='Betamericano' required />
            <Field label='Brand URL (optional)' value={brandUrl} onChange={setBrandUrl} placeholder='https://betamericano.com' />
          </Section>

          {error && <p className='text-sm text-red-600'>{error}</p>}

          <div className='flex items-center gap-3'>
            <button
              type='submit'
              disabled={mutation.isPending}
              className='bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-dark disabled:opacity-50'
            >
              {mutation.isPending ? 'Creating…' : 'Create operator'}
            </button>
            <Link to='/platform/operators' className='text-sm text-gray-600 hover:text-gray-800'>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='space-y-3'>
      <p className='text-xs font-semibold text-gray-700 uppercase tracking-wider'>{title}</p>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', required, hint, monospace,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
  monospace?: boolean;
}) {
  return (
    <label className='block'>
      <span className='block text-xs font-medium text-gray-700 mb-1'>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary ${monospace ? 'font-mono uppercase' : ''}`}
      />
      {hint && <span className='block text-xs text-gray-600 mt-1'>{hint}</span>}
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <label className='block'>
      <span className='block text-xs font-medium text-gray-700 mb-1'>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary bg-white'
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
