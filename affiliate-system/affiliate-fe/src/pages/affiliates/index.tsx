import { useRef, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { AFFILIATES_API_URLS, OPERATOR_API_URLS, COMMISSION_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import UpgradeBanner from '@components/core-components/UpgradeBanner';
import PlanBadge from '@components/core-components/PlanBadge';

interface InviteLinkResponse { inviteLink: string; }

interface PlanLimits {
  name: string;
  maxAffiliates: number;
  commissionTypes: string[];
  subAffiliates: boolean;
  campaignTracking: boolean;
}

interface PlanResponse {
  plan: string;
  limits: PlanLimits;
}

// ── types ─────────────────────────────────────────────────────────────────────

interface CommissionPlan {
  _id: string;
  name: string;
  type: string;
}

interface Affiliate {
  _id: string;
  email: string;
  username: string;
  name: string;
  status: string;
  mobileNumber?: string;
  mobileCountryCode?: string;
  createdAt: string;
  referralCodes?: string[];
  commissionPlanId?: CommissionPlan | null;
  parentAffiliate?: { _id: string; username: string; email: string; name: string } | null;
  overrideRate?: number;
}

interface AffiliatesResponse {
  affiliates: Affiliate[];
  total: number;
}

interface CreateResult {
  user: { id: string; email: string; username: string; status: string };
  affiliateCode: string;
  allCodes: string[];
  activateUrl: string;
}

interface BulkResult {
  created: { email: string; username: string; affiliateCode: string; allCodes: string[]; activateUrl: string }[];
  failed:  { email: string; error: string }[];
}

type Tab = 'affiliates' | 'add' | 'bulk' | 'invite';

const TABS: { key: Tab; label: string }[] = [
  { key: 'affiliates', label: 'Affiliates'       },
  { key: 'invite',     label: 'Invite Affiliate' },
  { key: 'add',        label: 'Add Affiliate'    },
  { key: 'bulk',       label: 'Bulk Import'      },
];

// ── field helper ──────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = 'text', hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <div>
      <label className='block text-xs font-medium text-gray-600 mb-1'>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
      />
      {hint && <p className='text-xs text-gray-400 mt-1'>{hint}</p>}
    </div>
  );
}

// ── Plan type badge ───────────────────────────────────────────────────────────

function planTypeBadgeCls(type: string) {
  const map: Record<string, string> = {
    revshare:        'bg-blue-100 text-blue-700',
    cpa:             'bg-green-100 text-green-700',
    hybrid:          'bg-purple-100 text-purple-700',
    tiered_revshare: 'bg-warning-light text-warning',
  };
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[type] ?? 'bg-gray-100 text-gray-600'}`;
}

// ── Plan assign modal ─────────────────────────────────────────────────────────

function PlanAssignModal({
  affiliate, onClose, onSaved,
}: { affiliate: Affiliate; onClose: () => void; onSaved: () => void }) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    affiliate.commissionPlanId?._id ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const { data: plans = [] } = useBaseQuery<CommissionPlan[]>({
    endpoint: COMMISSION_API_URLS.PLANS(),
    queryKey: ['commission-plans'],
  });

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await axiosInstance.patch(COMMISSION_API_URLS.AFFILIATE_PLAN(affiliate._id), {
        planId: selectedPlanId || null,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to assign plan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-5'>
        <div>
          <h2 className='text-base font-semibold text-gray-800'>Assign Commission Plan</h2>
          <p className='text-xs text-gray-400 mt-0.5'>{affiliate.username} · {affiliate.email}</p>
        </div>

        <div className='space-y-2'>
          {/* Default option */}
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            selectedPlanId === '' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'
          }`}>
            <input type='radio' name='plan' value='' checked={selectedPlanId === ''}
              onChange={() => setSelectedPlanId('')} className='mt-0.5 accent-primary' />
            <div>
              <p className='text-sm font-medium text-gray-700'>Default plan</p>
              <p className='text-xs text-gray-400'>Uses the operator default commission plan</p>
            </div>
          </label>

          {/* Plan options */}
          {plans.map((p) => (
            <label key={p._id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedPlanId === p._id ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'
            }`}>
              <input type='radio' name='plan' value={p._id} checked={selectedPlanId === p._id}
                onChange={() => setSelectedPlanId(p._id)} className='mt-0.5 accent-primary' />
              <div className='flex-1'>
                <div className='flex items-center gap-2'>
                  <p className='text-sm font-medium text-gray-700'>{p.name}</p>
                  <span className={planTypeBadgeCls(p.type)}>{p.type.replace('_', ' ')}</span>
                </div>
              </div>
            </label>
          ))}

          {plans.length === 0 && (
            <p className='text-xs text-gray-400 px-1'>No plans created yet. Create one in the Commission page first.</p>
          )}
        </div>

        {error && <p className='text-xs text-red-500'>{error}</p>}

        <div className='flex justify-end gap-2'>
          <button onClick={onClose}
            className='px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className='px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-60'>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Set parent modal ──────────────────────────────────────────────────────────

function SetParentModal({
  affiliate, affiliates, onClose, onSaved,
}: { affiliate: Affiliate; affiliates: Affiliate[]; onClose: () => void; onSaved: () => void }) {
  const [parentId, setParentId]       = useState<string>(affiliate.parentAffiliate?._id ?? '');
  const [overrideRate, setOverrideRate] = useState<string>(String(affiliate.overrideRate ?? 0));
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [upgradeBanner, setUpgradeBanner] = useState<{ message: string; currentPlan: string; requiredPlan: string } | null>(null);

  const { data: planData } = useBaseQuery<PlanResponse>({
    endpoint: OPERATOR_API_URLS.GET_PLAN(),
    queryKey: ['operator-plan'],
  });

  const subAffiliatesBlocked = planData && !planData.limits.subAffiliates;

  // Candidates: active affiliates that are not the affiliate itself
  const candidates = affiliates.filter(
    (a) => a._id !== affiliate._id && a.status === 'active',
  );

  async function handleSave() {
    const rate = Number(overrideRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      setError('Override rate must be 0–100');
      return;
    }
    setSaving(true);
    setError('');
    setUpgradeBanner(null);
    try {
      await axiosInstance.patch(AFFILIATES_API_URLS.SET_PARENT(affiliate._id), {
        parentAffiliateId: parentId || null,
        overrideRate: rate,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      const respData = e?.response?.data;
      if (respData?.upgrade) {
        setUpgradeBanner({
          message: respData.error,
          currentPlan: respData.currentPlan,
          requiredPlan: respData.requiredPlan,
        });
      } else {
        setError(respData?.error ?? e?.message ?? 'Failed to set parent');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-5'>
        <div>
          <h2 className='text-base font-semibold text-gray-800'>Set Parent Affiliate</h2>
          <p className='text-xs text-gray-400 mt-0.5'>{affiliate.username} · {affiliate.email}</p>
        </div>

        {subAffiliatesBlocked ? (
          <UpgradeBanner
            message={`Sub-affiliates are not available on the ${planData.limits.name} plan. Upgrade to enable parent-child affiliate relationships.`}
            currentPlan={planData.plan}
            requiredPlan='growth'
          />
        ) : (
          <>
            <div className='space-y-4'>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Parent Affiliate</label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                >
                  <option value=''>— None (clear parent) —</option>
                  {candidates.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.username} ({a.email})
                    </option>
                  ))}
                </select>
                {candidates.length === 0 && (
                  <p className='text-xs text-gray-400 mt-1'>No eligible parent affiliates (active affiliates without a parent).</p>
                )}
              </div>

              {parentId && (
                <div>
                  <label className='block text-xs font-medium text-gray-600 mb-1'>
                    Override Rate (%) — % of sub&apos;s NGR paid to parent
                  </label>
                  <input
                    type='number'
                    min={0}
                    max={100}
                    value={overrideRate}
                    onChange={(e) => setOverrideRate(e.target.value)}
                    className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                  />
                  <p className='text-xs text-gray-400 mt-1'>
                    e.g. 10 means the parent earns 10% of this affiliate&apos;s NGR on top of their own commission.
                  </p>
                </div>
              )}
            </div>

            {upgradeBanner && (
              <UpgradeBanner
                message={upgradeBanner.message}
                currentPlan={upgradeBanner.currentPlan}
                requiredPlan={upgradeBanner.requiredPlan}
              />
            )}

            {error && <p className='text-xs text-red-500'>{error}</p>}
          </>
        )}

        <div className='flex justify-end gap-2'>
          <button onClick={onClose}
            className='px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'>
            Cancel
          </button>
          {!subAffiliatesBlocked && (
            <button onClick={handleSave} disabled={saving}
              className='px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-60'>
              {saving ? 'Saving\u2026' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Affiliates list tab ───────────────────────────────────────────────────────

function AffiliatesTab() {
  const [assigningAffiliate, setAssigningAffiliate] = useState<Affiliate | null>(null);
  const [settingParent, setSettingParent]           = useState<Affiliate | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyInviteLink = (affiliateId: string) => {
    const link = `${window.location.origin}/activate?userId=${affiliateId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(affiliateId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const { data, isLoading, refetch } = useBaseQuery<AffiliatesResponse>({
    endpoint: AFFILIATES_API_URLS.LIST(),
    queryKey: ['affiliates-list'],
  });

  const { data: planData } = useBaseQuery<PlanResponse>({
    endpoint: OPERATOR_API_URLS.GET_PLAN(),
    queryKey: ['operator-plan'],
  });

  const affiliates = data?.affiliates ?? [];

  return (
    <div className='bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden'>
      <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
        <p className='text-sm font-medium text-gray-800'>Affiliates</p>
        <div className='flex items-center gap-3'>
          {planData && (
            <span className='text-xs text-gray-500 flex items-center gap-1.5'>
              {data?.total ?? 0} / {planData.limits.maxAffiliates} affiliates
              <PlanBadge plan={planData.plan} />
            </span>
          )}
          {!planData && <p className='text-xs text-gray-400'>{data?.total ?? 0} total</p>}
        </div>
      </div>

      {isLoading && <p className='text-sm text-gray-400 px-5 py-4'>Loading...</p>}

      {!isLoading && affiliates.length === 0 && (
        <p className='text-sm text-gray-400 px-5 py-6 text-center'>
          No affiliates yet. Add affiliates using the tabs above.
        </p>
      )}

      {affiliates.length > 0 && (
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-gray-50'>
              <tr>
                {['Name', 'Username', 'Email', 'Phone', 'Status', 'Commission Plan', 'Parent', 'Joined'].map((h) => (
                  <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-gray-500 border-r border-gray-100 last:border-r-0 whitespace-nowrap'>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {affiliates.map((a, i) => (
                <tr key={a._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100'>{a.name || '—'}</td>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100'>{a.username || '—'}</td>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100'>{a.email}</td>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100'>
                    {a.mobileCountryCode && a.mobileNumber
                      ? `${a.mobileCountryCode.startsWith('+') ? '' : '+'}${a.mobileCountryCode} ${a.mobileNumber}`
                      : '—'}
                  </td>
                  <td className='px-4 py-3 text-xs border-r border-gray-100'>
                    <div className='flex flex-col gap-1'>
                      <span className={`w-fit px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.status === 'active'  ? 'bg-green-100 text-green-700' :
                        a.status === 'pending' ? 'bg-warning-light text-warning' :
                                                 'bg-gray-100 text-gray-500'
                      }`}>
                        {a.status}
                      </span>
                      {a.status === 'pending' && (
                        <button
                          onClick={() => copyInviteLink(a._id)}
                          className='text-xs text-primary hover:underline text-left whitespace-nowrap'
                        >
                          {copiedId === a._id ? 'Copied!' : 'Copy Invite Link'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className='px-4 py-3 text-xs border-r border-gray-100'>
                    <div className='flex items-center gap-2'>
                      {a.commissionPlanId
                        ? <span className={planTypeBadgeCls(a.commissionPlanId.type)}>{a.commissionPlanId.name}</span>
                        : <span className='text-gray-400'>Default</span>}
                      <button
                        onClick={() => setAssigningAffiliate(a)}
                        className='text-xs text-primary hover:underline shrink-0'
                      >
                        Change
                      </button>
                    </div>
                  </td>
                  <td className='px-4 py-3 text-xs border-r border-gray-100'>
                    <div className='flex flex-col gap-0.5'>
                      {a.parentAffiliate ? (
                        <span className='text-gray-700 font-medium'>{a.parentAffiliate.username}</span>
                      ) : (
                        <span className='text-gray-400'>—</span>
                      )}
                      {a.parentAffiliate && a.overrideRate ? (
                        <span className='text-gray-400'>{a.overrideRate}% override</span>
                      ) : null}
                      <button
                        onClick={() => setSettingParent(a)}
                        className='text-primary hover:underline text-left'
                      >
                        {a.parentAffiliate ? 'Change' : 'Set'}
                      </button>
                    </div>
                  </td>
                  <td className='px-4 py-3 text-xs text-gray-700'>
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-GB') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assigningAffiliate && (
        <PlanAssignModal
          affiliate={assigningAffiliate}
          onClose={() => setAssigningAffiliate(null)}
          onSaved={() => { refetch(); setAssigningAffiliate(null); }}
        />
      )}

      {settingParent && (
        <SetParentModal
          affiliate={settingParent}
          affiliates={affiliates}
          onClose={() => setSettingParent(null)}
          onSaved={() => { refetch(); setSettingParent(null); }}
        />
      )}
    </div>
  );
}

// ── Add single affiliate tab ──────────────────────────────────────────────────

function AddAffiliateTab() {
  const [email, setEmail]       = useState('');
  const [username, setUsername] = useState('');
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [codes, setCodes]       = useState('');
  const [result, setResult]     = useState<CreateResult | null>(null);
  const [error, setError]       = useState('');
  const [upgradeBanner, setUpgradeBanner] = useState<{ message: string; currentPlan: string; requiredPlan: string } | null>(null);

  const { mutate, isPending } = useBaseMutation<CreateResult>({
    endpoint: AFFILIATES_API_URLS.CREATE(),
    method: 'post',
    onSuccess: (data) => {
      setResult(data);
      setUpgradeBanner(null);
      setEmail(''); setUsername(''); setName(''); setPhone(''); setCodes('');
    },
    onError: (e: any) => {
      const respData = e?.response?.data;
      if (respData?.upgrade) {
        setUpgradeBanner({
          message: respData.error,
          currentPlan: respData.currentPlan,
          requiredPlan: respData.requiredPlan,
        });
        setError('');
      } else {
        setUpgradeBanner(null);
        setError(respData?.error ?? e?.message ?? 'Failed to create affiliate');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setUpgradeBanner(null);
    const referralCodes = codes.split(',').map(c => c.trim()).filter(Boolean);
    mutate({ email, username, name, mobileNumber: phone || undefined, referralCodes });
  };

  return (
    <div className='max-w-lg space-y-6'>
      <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4'>
        <h2 className='text-sm font-semibold text-gray-800'>Add Affiliate</h2>
        <p className='text-xs text-gray-500'>
          Creates an account with <span className='font-medium'>pending</span> status.
          Share the activate link so they can set their password.
        </p>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <Field label='Full Name *'   value={name}     onChange={setName}     placeholder='Jane Doe' />
          <Field label='Email *'       value={email}    onChange={setEmail}    placeholder='jane@example.com' type='email' />
          <Field label='Username *'    value={username} onChange={setUsername} placeholder='jane_doe' />
          <Field label='Phone'         value={phone}    onChange={setPhone}    placeholder='+90 555 000 0000' />
          <Field
            label='Legacy Codes'
            value={codes}
            onChange={setCodes}
            placeholder='CODE1, CODE2'
            hint='Comma-separated legacy affiliate codes from their previous system'
          />

          {upgradeBanner && (
            <UpgradeBanner
              message={upgradeBanner.message}
              currentPlan={upgradeBanner.currentPlan}
              requiredPlan={upgradeBanner.requiredPlan}
            />
          )}

          {error && <p className='text-xs text-red-500'>{error}</p>}

          <button
            type='submit'
            disabled={isPending}
            className='w-full bg-primary text-white text-sm font-medium py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors'
          >
            {isPending ? 'Creating...' : 'Create Affiliate'}
          </button>
        </form>
      </div>

      {result && (
        <div className='bg-green-50 border border-green-200 rounded-xl p-5 space-y-3'>
          <p className='text-sm font-medium text-green-800'>Affiliate created successfully</p>
          <div className='space-y-1 text-xs text-green-700'>
            <p><span className='font-medium'>Email:</span> {result.user.email}</p>
            <p><span className='font-medium'>Affiliate Code:</span> <span className='font-mono'>{result.affiliateCode}</span></p>
            {result.allCodes.length > 1 && (
              <p><span className='font-medium'>All Codes:</span> <span className='font-mono'>{result.allCodes.join(', ')}</span></p>
            )}
          </div>
          <div className='mt-2'>
            <p className='text-xs text-green-600 mb-1 font-medium'>Activate Link:</p>
            <div className='bg-white rounded-lg px-3 py-2 text-xs font-mono text-gray-700 border border-green-200 break-all'>
              {window.location.origin}{result.activateUrl}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bulk import tab ───────────────────────────────────────────────────────────

const BULK_TEMPLATE = `email,username,name,mobileNumber,referralCodes
jane@example.com,jane_doe,Jane Doe,+905550000000,CODE1
john@example.com,john_doe,John Doe,,LEGACY_XYZ`;

function BulkImportTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview]   = useState<any[]>([]);
  const [result, setResult]     = useState<BulkResult | null>(null);
  const [error, setError]       = useState('');
  const [upgradeBanner, setUpgradeBanner] = useState<{ message: string; currentPlan: string; requiredPlan: string } | null>(null);

  const { mutate, isPending } = useBaseMutation<BulkResult>({
    endpoint: AFFILIATES_API_URLS.BULK_CREATE(),
    method: 'post',
    onSuccess: (data) => { setResult(data); setPreview([]); setUpgradeBanner(null); },
    onError: (e: any) => {
      const respData = e?.response?.data;
      if (respData?.upgrade) {
        setUpgradeBanner({
          message: respData.error,
          currentPlan: respData.currentPlan,
          requiredPlan: respData.requiredPlan,
        });
        setError('');
      } else {
        setUpgradeBanner(null);
        setError(respData?.error ?? e?.message ?? 'Bulk import failed');
      }
    },
  });

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      // parse referralCodes into array
      if (obj.referralCodes) {
        obj.referralCodes = obj.referralCodes.split(';').map((c: string) => c.trim()).filter(Boolean);
      }
      return obj;
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(''); setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target?.result as string);
        setPreview(rows);
      } catch {
        setError('Failed to parse CSV. Check the format.');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (preview.length === 0) return;
    setError('');
    setUpgradeBanner(null);
    mutate(preview as any);
  };

  const downloadTemplate = () => {
    const blob = new Blob([BULK_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'affiliate-import-template.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className='space-y-6 max-w-3xl'>
      <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-sm font-semibold text-gray-800'>Bulk Import</h2>
            <p className='text-xs text-gray-500 mt-0.5'>Upload a CSV with multiple affiliates at once (max 500 rows).</p>
          </div>
          <button
            onClick={downloadTemplate}
            className='text-xs text-primary font-medium hover:underline shrink-0'
          >
            Download Template
          </button>
        </div>

        <div
          className='border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors'
          onClick={() => fileRef.current?.click()}
        >
          <p className='text-sm text-gray-500'>Click to upload CSV</p>
          <p className='text-xs text-gray-400 mt-1'>Columns: email, username, name, mobileNumber, referralCodes (semicolon-separated)</p>
          <input ref={fileRef} type='file' accept='.csv' onChange={handleFile} className='hidden' />
        </div>

        {preview.length > 0 && (
          <div className='space-y-3'>
            <p className='text-xs text-gray-600 font-medium'>{preview.length} rows detected</p>
            <div className='overflow-x-auto rounded-lg border border-gray-100'>
              <table className='w-full text-xs'>
                <thead className='bg-gray-50'>
                  <tr>
                    {['Email', 'Username', 'Name', 'Phone', 'Codes'].map(h => (
                      <th key={h} className='px-3 py-2 text-left text-gray-500 font-medium border-r border-gray-100 last:border-r-0'>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 5).map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className='px-3 py-2 border-r border-gray-100'>{row.email}</td>
                      <td className='px-3 py-2 border-r border-gray-100'>{row.username}</td>
                      <td className='px-3 py-2 border-r border-gray-100'>{row.name}</td>
                      <td className='px-3 py-2 border-r border-gray-100'>{row.mobileNumber || '—'}</td>
                      <td className='px-3 py-2'>{Array.isArray(row.referralCodes) ? row.referralCodes.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 5 && <p className='text-xs text-gray-400'>...and {preview.length - 5} more rows</p>}

            {upgradeBanner && (
              <UpgradeBanner
                message={upgradeBanner.message}
                currentPlan={upgradeBanner.currentPlan}
                requiredPlan={upgradeBanner.requiredPlan}
              />
            )}

            {error && <p className='text-xs text-red-500'>{error}</p>}

            <button
              onClick={handleImport}
              disabled={isPending}
              className='w-full bg-primary text-white text-sm font-medium py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors'
            >
              {isPending ? 'Importing...' : `Import ${preview.length} Affiliates`}
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className='space-y-4'>
          {result.created.length > 0 && (
            <div className='bg-green-50 border border-green-200 rounded-xl p-5'>
              <p className='text-sm font-medium text-green-800 mb-3'>{result.created.length} affiliates created</p>
              <div className='space-y-2 max-h-64 overflow-y-auto'>
                {result.created.map((r, i) => (
                  <div key={i} className='text-xs text-green-700 flex items-center gap-2'>
                    <span className='font-medium'>{r.email}</span>
                    <span className='font-mono bg-green-100 px-1.5 py-0.5 rounded'>{r.affiliateCode}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.failed.length > 0 && (
            <div className='bg-red-50 border border-red-200 rounded-xl p-5'>
              <p className='text-sm font-medium text-red-800 mb-3'>{result.failed.length} failed</p>
              <div className='space-y-2'>
                {result.failed.map((r, i) => (
                  <div key={i} className='text-xs text-red-700'>
                    <span className='font-medium'>{r.email}:</span> {r.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Invite tab ────────────────────────────────────────────────────────────────

function InviteTab() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useBaseQuery<InviteLinkResponse>({
    endpoint: OPERATOR_API_URLS.GET_INVITE_LINK(),
    queryKey: ['operator-invite-link'],
  });

  const handleCopy = () => {
    if (!data?.inviteLink) return;
    navigator.clipboard.writeText(data.inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 max-w-xl'>
      <h2 className='text-sm font-medium text-gray-800 mb-1'>Invite Affiliates</h2>
      <p className='text-xs text-gray-500 mb-4'>
        Share this link with affiliates to join your network.
      </p>

      {isLoading && <p className='text-sm text-gray-400'>Loading invite link...</p>}
      {isError && <p className='text-sm text-red-500'>Failed to load invite link. Please try again.</p>}

      {data?.inviteLink && (
        <div className='flex items-center gap-3'>
          <div className='flex-1 bg-gray-100 rounded-lg px-4 py-2.5 text-sm text-gray-600 truncate border border-gray-200'>
            {data.inviteLink}
          </div>
          <button
            onClick={handleCopy}
            className='shrink-0 bg-primary hover:bg-primary/90 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors'
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Affiliates() {
  const [activeTab, setActiveTab] = useState<Tab>('affiliates');

  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>
      <h1 className='text-xl font-semibold text-gray-800'>Affiliates</h1>

      <div className='flex gap-1 bg-white p-1 rounded-lg w-full border border-gray-200 shadow-sm'>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'affiliates' && <AffiliatesTab />}
      {activeTab === 'add'        && <AddAffiliateTab />}
      {activeTab === 'bulk'       && <BulkImportTab />}
      {activeTab === 'invite'     && <InviteTab />}
    </div>
  );
}
