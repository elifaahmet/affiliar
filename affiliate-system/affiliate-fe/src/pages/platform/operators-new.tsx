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
  const [mode, setMode]                           = useState<'pay_now' | 'trial'>('pay_now');
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
      mode,
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
            <div className='text-xs text-gray-600 pt-1'>
              Brands and additional accounts are attached from the operator detail page after activation.
            </div>
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
            <div>
              <span className='block text-xs font-medium text-gray-700 mb-1'>Billing start</span>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                <ModeOption
                  selected={mode === 'pay_now'}
                  onClick={() => setMode('pay_now')}
                  title='Require payment now'
                  body={<>Starts in <code>past_due</code>. Owner sees a Pay-now CTA on first login; status flips to <code>active</code> after the first successful charge.</>}
                />
                <ModeOption
                  selected={mode === 'trial'}
                  onClick={() => setMode('trial')}
                  title='3-day trial'
                  body={<>Full panel access for 3 days. Reminders fire on day&nbsp;3 (due), 5 and 7; <b>suspended on day&nbsp;10</b> if unpaid.</>}
                />
              </div>
            </div>
          </Section>

          <Section title='Owner user'>
            <Field label='Name *' value={ownerName} onChange={setOwnerName} placeholder='Jane Doe' required />
            <Field label='Email *' value={ownerEmail} onChange={setOwnerEmail} placeholder='jane@betamericano.com' type='email' required />
            <Field label='Username *' value={ownerUsername} onChange={setOwnerUsername} placeholder='janedoe' required />
            <p className='text-xs text-gray-600 pt-1'>
              Additional accounts can be added from the operator detail page once this one's activated.
            </p>
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

function ModeOption({
  selected, onClick, title, body,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
        selected
          ? 'border-primary bg-violet-50 ring-1 ring-primary'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className='text-sm font-semibold text-gray-900'>{title}</div>
      <div className='text-xs text-gray-600 mt-1 leading-relaxed'>{body}</div>
    </button>
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
