import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@components/core-components/icon';
import axiosInstance from 'config/axiosInstance';
import { AFFILIATES_API_URLS } from 'config/apiUrls';

type Mode = 'raw' | 'aggregated';
type Transport = 'kafka' | 'rest';

interface FormState {
  companyName: string;
  brandName: string;
  contactName: string;
  email: string;
  website: string;
  integrationMode: Mode;
  transport: Transport;
  notes: string;
}

const EMPTY: FormState = {
  companyName: '',
  brandName: '',
  contactName: '',
  email: '',
  website: '',
  integrationMode: 'raw',
  transport: 'rest',
  notes: '',
};

// Plain-language descriptions: the applicant is choosing how their platform
// will talk to us, and the field names alone ("raw", "aggregated") don't tell
// an integrator which one fits them.
const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: 'raw',        label: 'Raw events',          hint: 'Send every bet, win and deposit as it happens. Affiliar aggregates.' },
  { value: 'aggregated', label: 'Aggregated activity', hint: 'Send hourly casino activity already summed on your side. Lower volume.' },
];

const TRANSPORTS: { value: Transport; label: string; hint: string }[] = [
  { value: 'rest',  label: 'REST',  hint: 'An HTTP call. Simplest to start with; your code owns the retry.' },
  { value: 'kafka', label: 'Kafka', hint: 'For continuous production traffic. Events wait in the topic if we are unreachable.' },
];

const inputClass =
  'w-full bg-white h-[44px] border border-gray-200 rounded-lg px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors';
const labelClass = 'mb-1.5 block text-xs font-semibold text-gray-700';

function Field({
  label, value, onChange, placeholder, required, type = 'text',
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        {required && ' *'}
      </label>
      <input className={inputClass} type={type} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

function Choice<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: T; label: string; hint: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className={labelClass}>{label} *</label>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <p className={`text-sm font-semibold ${active ? 'text-primary' : 'text-gray-900'}`}>{o.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-600">{o.hint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function OperatorApply() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.companyName || !form.contactName || !form.email) {
      setError('Company, contact name and email are required.');
      return;
    }
    setLoading(true);
    try {
      await axiosInstance.post(AFFILIATES_API_URLS.OPERATOR_REGISTER(), form);
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="lg:hidden mb-10">
          <Icon iconName="affiliarDark" svgProps={{ width: 130, height: 28 }} />
        </div>
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-600">Application received</p>
        <h1 className="font-display text-4xl leading-tight tracking-tight text-gray-900">
          Thanks — we&apos;ll be <span className="italic text-primary">in touch</span>.
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          Every application is reviewed by a person. Once it&apos;s approved you&apos;ll get an email
          with a link to set your password and collect your integration credentials.
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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <div className="lg:hidden mb-10">
        <Icon iconName="affiliarDark" svgProps={{ width: 130, height: 28 }} />
      </div>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-600">Apply for an account</p>
      <h1 className="font-display text-4xl leading-tight tracking-tight text-gray-900">
        Run your affiliate programme on <span className="italic text-primary">Affiliar</span>.
      </h1>
      <p className="mt-3 text-sm text-gray-700">
        Tell us about your platform and how you&apos;d like to connect it. We review each application
        and send your credentials once it&apos;s approved.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Company" value={form.companyName} onChange={set('companyName')} placeholder="Acme Gaming Ltd" required />
        <Field label="Brand" value={form.brandName} onChange={set('brandName')} placeholder="acmecasino.com" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" value={form.contactName} onChange={set('contactName')} placeholder="Jane Doe" required />
          <Field label="Work email" type="email" value={form.email} onChange={set('email')} placeholder="jane@acme.com" required />
        </div>
        <Field label="Website" value={form.website} onChange={set('website')} placeholder="https://acmecasino.com" />

        <Choice
          label="How will you send activity"
          options={MODES}
          value={form.integrationMode}
          onChange={(v) => setForm((f) => ({ ...f, integrationMode: v }))}
        />
        <Choice
          label="Over which transport"
          options={TRANSPORTS}
          value={form.transport}
          onChange={(v) => setForm((f) => ({ ...f, transport: v }))}
        />
        <p className="text-[11px] leading-snug text-gray-600">
          Both carry the same event shape, so starting on REST and moving to Kafka later costs
          nothing — you can change your mind after you&apos;re live.
        </p>

        <div>
          <label className={labelClass}>Anything we should know</label>
          <textarea
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Platform, volumes, timeline…"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-[46px] w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
        >
          {loading ? 'Submitting…' : 'Submit application'}
        </button>

        <p className="text-center text-xs text-gray-600">
          Already have an account? <Link to="/" className="font-semibold text-primary">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
