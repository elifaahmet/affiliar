import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { PLATFORM_ADMIN_API_URLS } from 'config/apiUrls';

/* ── Types ──────────────────────────────────────────────────────────── */

interface OperatorOwner {
  _id: string;
  email: string;
  name: string;
  username: string;
  status: string;
  createdAt: string;
  isDeleted?: boolean;
}
interface OperatorBrand {
  _id: string;
  id: number;
  name: string;
  url: string | null;
  enabled: boolean;
  ownerUserId: string;
  createdAt: string;
}
interface OperatorDetail {
  _id: string;
  id: number;
  name: string;
  plan: string;
  billingStatus: string;
  activeDiscountCode: string;
  billingCycle: string | null;
  nextBillingDate: string | null;
  trialEndsAt: string | null;
  pastDueAt: string | null;
  affiliatePayoutSettings: { minPayoutCents: number; currency: string };
  featureOverrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
interface DetailResponse {
  operator: OperatorDetail;
  owners: OperatorOwner[];
  brands: OperatorBrand[];
  counts: { affiliates: number; transactions: number };
}

interface AffiliateRow {
  _id: string;
  email: string;
  name: string;
  username: string;
  status: string;
  parentAffiliateId: string | null;
  subAffiliateCount: number;
  createdAt: string;
}
interface BillingResponse {
  billingStatus: string;
  plan: string;
  billingCycle: string | null;
  nextBillingDate: string | null;
  trialEndsAt: string | null;
  pastDueAt: string | null;
  activeDiscountCode: string;
  transactions: Array<{
    _id: string;
    plan: string;
    amountUsd: number;
    discountCode?: string;
    discountUsd?: number;
    status: string;
    referenceId?: string;
    createdAt: string;
    paidAt?: string;
  }>;
}
interface CommissionPlanRow {
  _id: string;
  name: string;
  type?: string;
  isDefault?: boolean;
  isActive?: boolean;
  createdAt: string;
}

/* ── Constants ──────────────────────────────────────────────────────── */

const PLAN_OPTIONS = [
  { key: 'tier1',   label: '1-Tier ($53/mo)' },
  { key: 'tier2',   label: '1+2 Tier ($98/mo)' },
  { key: 'plus',    label: 'Affiliate Plus ($494/mo)' },
  { key: 'plusL2',  label: 'Plus L2 ($998/mo)' },
  { key: 'pro',     label: 'Pro ($1799/mo)' },
];

const BILLING_STATUS_OPTIONS = ['trial', 'active', 'past_due', 'suspended', 'cancelled'] as const;

const STATUS_STYLES: Record<string, string> = {
  trial:     'bg-violet-50 text-violet-700',
  active:    'bg-green-50 text-green-700',
  past_due:  'bg-yellow-50 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

type TabKey = 'overview' | 'brands' | 'users' | 'affiliates' | 'billing' | 'commission';

/* ── Page ───────────────────────────────────────────────────────────── */

export default function PlatformOperatorDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>('overview');

  const { data, isLoading, isError, refetch } = useBaseQuery<DetailResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.GET_OPERATOR(id),
    queryKey: ['platform-operator', id],
  });

  if (isLoading) return <Shell><div className='p-8 text-center text-sm text-gray-600'>Loading…</div></Shell>;
  if (isError || !data) return <Shell><div className='p-8 text-center text-sm text-red-600'>Failed to load operator.</div></Shell>;

  const op = data.operator;

  return (
    <Shell>
      <div className='space-y-1'>
        <Link to='/platform/operators' className='text-xs text-primary hover:underline'>
          ← Back to operators
        </Link>
        <div className='flex items-center gap-3 flex-wrap'>
          <h1 className='text-lg font-semibold text-gray-900'>{op.name}</h1>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            STATUS_STYLES[op.billingStatus] ?? 'bg-gray-100 text-gray-700'
          }`}>
            {op.billingStatus.replace('_', ' ')}
          </span>
          <span className='text-xs text-gray-500'>Plan: <b>{op.plan}</b></span>
          {op.activeDiscountCode && (
            <span className='text-xs text-gray-500'>Discount: <code className='bg-violet-50 px-1 rounded text-violet-700'>{op.activeDiscountCode}</code></span>
          )}
        </div>
        <div className='text-xs text-gray-500'>
          {data.owners.length} owner user{data.owners.length === 1 ? '' : 's'} ·{' '}
          {data.brands.length} brand{data.brands.length === 1 ? '' : 's'} ·{' '}
          {data.counts.affiliates} affiliate{data.counts.affiliates === 1 ? '' : 's'} ·{' '}
          {data.counts.transactions} billing transaction{data.counts.transactions === 1 ? '' : 's'}
        </div>
      </div>

      <nav className='border-b border-gray-200 flex gap-1 flex-wrap'>
        <Tab label='Overview'     active={tab === 'overview'}     onClick={() => setTab('overview')} />
        <Tab label='Brands'       active={tab === 'brands'}       onClick={() => setTab('brands')} count={data.brands.length} />
        <Tab label='Users'        active={tab === 'users'}        onClick={() => setTab('users')} count={data.owners.length} />
        <Tab label='Affiliates'   active={tab === 'affiliates'}   onClick={() => setTab('affiliates')} count={data.counts.affiliates} />
        <Tab label='Billing'      active={tab === 'billing'}      onClick={() => setTab('billing')} count={data.counts.transactions} />
        <Tab label='Commission'   active={tab === 'commission'}   onClick={() => setTab('commission')} />
      </nav>

      {tab === 'overview' &&  <OverviewTab op={op} onSaved={refetch} />}
      {tab === 'brands' &&    <BrandsTab id={id} brands={data.brands} onChange={refetch} />}
      {tab === 'users' &&     <UsersTab id={id} owners={data.owners} onChange={refetch} />}
      {tab === 'affiliates' && <AffiliatesTab id={id} />}
      {tab === 'billing' &&   <BillingTab id={id} />}
      {tab === 'commission' && <CommissionTab id={id} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className='h-full overflow-auto p-6 pb-24 space-y-6'>{children}</div>;
}

function Tab({ label, active, count, onClick }: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
        active ? 'border-primary text-primary' : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
      {count !== undefined && <span className='ml-1.5 text-xs text-gray-400'>{count}</span>}
    </button>
  );
}

/* ── Overview tab ──────────────────────────────────────────────────── */

function OverviewTab({ op, onSaved }: { op: OperatorDetail; onSaved: () => void }) {
  const [name, setName] = useState(op.name);
  const [plan, setPlan] = useState(op.plan);
  const [discount, setDiscount] = useState(op.activeDiscountCode);
  const [status, setStatus] = useState(op.billingStatus);
  const [nextBillingDate, setNextBillingDate] = useState(
    op.nextBillingDate ? new Date(op.nextBillingDate).toISOString().slice(0, 10) : '',
  );
  const [minPayoutCents, setMinPayoutCents] = useState(String(op.affiliatePayoutSettings?.minPayoutCents ?? 0));
  const [featureOverridesJson, setFeatureOverridesJson] = useState(
    JSON.stringify(op.featureOverrides ?? {}, null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const mutation = useBaseMutation({
    endpoint: PLATFORM_ADMIN_API_URLS.UPDATE_OPERATOR(op._id),
    method: 'patch',
    invalidateKeys: ['platform-operator', 'platform-operators'],
    onSuccess: () => { setOk(true); setError(null); onSaved(); },
    onError: (e: any) => { setOk(false); setError(e?.response?.data?.error ?? e?.message ?? 'Save failed'); },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOk(false);
    let parsedOverrides: unknown;
    try { parsedOverrides = JSON.parse(featureOverridesJson || '{}'); }
    catch { setError('featureOverrides is not valid JSON'); return; }
    mutation.mutate({
      name: name.trim(),
      plan,
      activeDiscountCode: discount.trim(),
      billingStatus: status,
      nextBillingDate: nextBillingDate || undefined,
      affiliatePayoutSettings: {
        minPayoutCents: Number(minPayoutCents) || 0,
        currency: op.affiliatePayoutSettings?.currency || 'USD',
      },
      featureOverrides: parsedOverrides,
    });
  };

  return (
    <form onSubmit={onSubmit} className='bg-white rounded-xl border border-violet-100 p-6 space-y-5 max-w-3xl'>
      <h2 className='text-sm font-semibold text-gray-700 uppercase tracking-wider'>Edit operator</h2>

      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        <FormField label='Name'>
          <input type='text' value={name} onChange={(e) => setName(e.target.value)} className={inputCx} />
        </FormField>
        <FormField label='Plan'>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCx}>
            {PLAN_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </FormField>
        <FormField label='Billing status' hint='Suspended kullanıcıyı paneli erişiminden engeller; active bunu geri açar.'>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCx}>
            {BILLING_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label='Next billing date' hint='ISO YYYY-MM-DD. Bu tarihte billing job reminder/suspend kadansını sürer.'>
          <input type='date' value={nextBillingDate} onChange={(e) => setNextBillingDate(e.target.value)} className={inputCx} />
        </FormField>
        <FormField label='Active discount code'>
          <input
            type='text'
            value={discount}
            onChange={(e) => setDiscount(e.target.value.toUpperCase())}
            placeholder='BETAMERICANO200'
            className={`${inputCx} font-mono uppercase`}
          />
        </FormField>
        <FormField label='Min payout cents'>
          <input type='number' min={0} value={minPayoutCents} onChange={(e) => setMinPayoutCents(e.target.value)} className={inputCx} />
        </FormField>
      </div>

      <FormField label='Feature overrides (JSON)' hint='Plan flags üzerine bindirilir. Örn: {"crewSystem":true}'>
        <textarea
          value={featureOverridesJson}
          onChange={(e) => setFeatureOverridesJson(e.target.value)}
          rows={4}
          className={`${inputCx} font-mono text-xs`}
        />
      </FormField>

      {error && <p className='text-sm text-red-600'>{error}</p>}
      {ok && <p className='text-sm text-green-600'>Saved.</p>}

      <div className='flex items-center gap-3'>
        <button
          type='submit'
          disabled={mutation.isPending}
          className='bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-dark disabled:opacity-50'
        >
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

/* ── Brands tab ─────────────────────────────────────────────────────── */

function BrandsTab({ id, brands, onChange }: { id: string; brands: OperatorBrand[]; onChange: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<OperatorBrand | null>(null);

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <button
          type='button'
          onClick={() => setShowAdd(true)}
          className='rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark'
        >
          + Add brand
        </button>
      </div>

      {brands.length === 0 ? (
        <div className='bg-white rounded-xl border border-violet-100 p-8 text-center text-sm text-gray-600'>
          Operatörün hiç brand'i yok. "+ Add brand" ile ilk brand'i oluştur.
        </div>
      ) : (
        <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
          <table className='w-full'>
            <thead className='bg-gray-50 text-xs font-semibold text-gray-700'>
              <tr>
                <th className='px-4 py-2 text-left'>#</th>
                <th className='px-4 py-2 text-left'>Name</th>
                <th className='px-4 py-2 text-left'>URL</th>
                <th className='px-4 py-2 text-left'>Status</th>
                <th className='px-4 py-2 text-right'></th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100 text-xs text-gray-700'>
              {brands.map((b) => (
                <tr key={b._id}>
                  <td className='px-4 py-2'>{b.id}</td>
                  <td className='px-4 py-2 font-medium'>{b.name}</td>
                  <td className='px-4 py-2 font-mono text-gray-600'>{b.url || '—'}</td>
                  <td className='px-4 py-2'>
                    {b.enabled
                      ? <span className='text-green-700'>Enabled</span>
                      : <span className='text-gray-500'>Disabled</span>}
                  </td>
                  <td className='px-4 py-2 text-right'>
                    <button type='button' onClick={() => setEditing(b)} className='text-primary hover:underline'>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <BrandModal
          id={id}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onChange(); }}
        />
      )}
      {editing && (
        <BrandModal
          id={id}
          brand={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange(); }}
        />
      )}
    </div>
  );
}

function BrandModal({ id, brand, onClose, onSaved }: { id: string; brand?: OperatorBrand; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(brand?.name || '');
  const [url, setUrl] = useState(brand?.url || '');
  const [enabled, setEnabled] = useState(brand?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  const create = useBaseMutation({
    endpoint: PLATFORM_ADMIN_API_URLS.CREATE_BRAND_FOR(id),
    method: 'post',
    invalidateKeys: ['platform-operator', id],
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Save failed'),
  });
  const update = useBaseMutation({
    endpoint: brand ? PLATFORM_ADMIN_API_URLS.UPDATE_BRAND_FOR(id, brand._id) : '',
    method: 'patch',
    invalidateKeys: ['platform-operator', id],
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Save failed'),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (brand) update.mutate({ name: name.trim(), url: url.trim() || null, enabled });
    else create.mutate({ name: name.trim(), url: url.trim() || undefined });
  };

  return (
    <Modal title={brand ? 'Edit brand' : 'New brand'} onClose={onClose}>
      <form onSubmit={onSubmit} className='space-y-4'>
        <FormField label='Name'>
          <input type='text' value={name} onChange={(e) => setName(e.target.value)} required className={inputCx} />
        </FormField>
        <FormField label='URL'>
          <input type='text' value={url || ''} onChange={(e) => setUrl(e.target.value)} placeholder='https://…' className={inputCx} />
        </FormField>
        {brand && (
          <label className='flex items-center gap-2 text-sm text-gray-700'>
            <input type='checkbox' checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>
        )}
        {error && <p className='text-sm text-red-600'>{error}</p>}
        <ModalActions
          onCancel={onClose}
          submitLabel={brand ? 'Save' : 'Add brand'}
          pending={create.isPending || update.isPending}
        />
      </form>
    </Modal>
  );
}

/* ── Users tab ─────────────────────────────────────────────────────── */

function UsersTab({ id, owners, onChange }: { id: string; owners: OperatorOwner[]; onChange: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  // Confirm dialog state — null = no dialog, otherwise the row we'd act on.
  const [confirm, setConfirm] = useState<{ user: OperatorOwner; action: 'remove' | 'restore' } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const removeMutation = useBaseMutation({
    endpoint: confirm?.user ? PLATFORM_ADMIN_API_URLS.REMOVE_USER_FOR(id, confirm.user._id) : '',
    method: 'delete',
    invalidateKeys: ['platform-operator', id],
    onSuccess: () => { setConfirm(null); onChange(); },
    onError: (e: any) => setActionError(e?.response?.data?.error ?? 'Remove failed'),
  });
  const restoreMutation = useBaseMutation({
    endpoint: confirm?.user ? PLATFORM_ADMIN_API_URLS.RESTORE_USER_FOR(id, confirm.user._id) : '',
    method: 'post',
    invalidateKeys: ['platform-operator', id],
    onSuccess: () => { setConfirm(null); onChange(); },
    onError: (e: any) => setActionError(e?.response?.data?.error ?? 'Restore failed'),
  });

  const activeCount = owners.filter((u) => !u.isDeleted).length;
  const sorted = [...owners].sort((a, b) => Number(!!a.isDeleted) - Number(!!b.isDeleted));

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <button
          type='button'
          onClick={() => setShowAdd(true)}
          className='rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark'
        >
          + Add account
        </button>
      </div>

      <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
        <table className='w-full'>
          <thead className='bg-gray-50 text-xs font-semibold text-gray-700'>
            <tr>
              <th className='px-4 py-2 text-left'>Name</th>
              <th className='px-4 py-2 text-left'>Email</th>
              <th className='px-4 py-2 text-left'>Username</th>
              <th className='px-4 py-2 text-left'>Status</th>
              <th className='px-4 py-2 text-left'>Joined</th>
              <th className='px-4 py-2 text-right'></th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-100 text-xs text-gray-700'>
            {sorted.map((u) => (
              <tr key={u._id} className={u.isDeleted ? 'bg-gray-50/60 text-gray-500' : ''}>
                <td className='px-4 py-2 font-medium'>
                  <span className={u.isDeleted ? 'line-through' : ''}>{u.name}</span>
                  {u.isDeleted && (
                    <span className='ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 not-italic no-underline'>
                      Deleted
                    </span>
                  )}
                </td>
                <td className={`px-4 py-2 ${u.isDeleted ? 'line-through' : ''}`}>{u.email}</td>
                <td className={`px-4 py-2 font-mono ${u.isDeleted ? 'line-through' : ''}`}>{u.username}</td>
                <td className='px-4 py-2'>
                  {u.isDeleted
                    ? <span className='text-gray-500'>—</span>
                    : <span className={u.status === 'pending' ? 'text-amber-700' : 'text-green-700'}>{u.status}</span>}
                </td>
                <td className='px-4 py-2'>{new Date(u.createdAt).toLocaleDateString('en-GB')}</td>
                <td className='px-4 py-2 text-right'>
                  {u.isDeleted ? (
                    <button
                      type='button'
                      onClick={() => { setActionError(null); setConfirm({ user: u, action: 'restore' }); }}
                      className='text-xs font-medium text-primary hover:underline'
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type='button'
                      onClick={() => { setActionError(null); setConfirm({ user: u, action: 'remove' }); }}
                      disabled={activeCount <= 1}
                      title={activeCount <= 1 ? 'Last active account — invite a replacement first.' : ''}
                      className='text-xs font-medium text-red-600 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed'
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <UserAddModal
          id={id}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onChange(); }}
        />
      )}

      {confirm && (
        <Modal
          title={confirm.action === 'remove' ? 'Remove account?' : 'Restore account?'}
          onClose={() => setConfirm(null)}
        >
          <div className='space-y-4 text-sm text-gray-700'>
            {confirm.action === 'remove' ? (
              <p>
                <b>{confirm.user.name}</b> ({confirm.user.email}) hesabını kaldıracaksın. Login engellenir
                ama veriler korunur — istediğinde Restore'la geri açabilirsin.
              </p>
            ) : (
              <p>
                <b>{confirm.user.name}</b> ({confirm.user.email}) hesabını tekrar aktifleştirecek. Eski şifresiyle
                login edebilir.
              </p>
            )}
            {actionError && <p className='text-sm text-red-600'>{actionError}</p>}
            <div className='flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setConfirm(null)}
                className='rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50'
              >
                Cancel
              </button>
              <button
                type='button'
                disabled={removeMutation.isPending || restoreMutation.isPending}
                onClick={() => {
                  if (confirm.action === 'remove') removeMutation.mutate({});
                  else restoreMutation.mutate({});
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  confirm.action === 'remove' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {removeMutation.isPending || restoreMutation.isPending
                  ? 'Working…'
                  : confirm.action === 'remove' ? 'Remove' : 'Restore'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function UserAddModal({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useBaseMutation({
    endpoint: PLATFORM_ADMIN_API_URLS.CREATE_USER_FOR(id),
    method: 'post',
    invalidateKeys: ['platform-operator', id],
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Save failed'),
  });

  return (
    <Modal title='Add operator account' onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate({ name: name.trim(), email: email.trim(), username: username.trim() }); }} className='space-y-4'>
        <FormField label='Name'>
          <input type='text' value={name} onChange={(e) => setName(e.target.value)} required className={inputCx} />
        </FormField>
        <FormField label='Email'>
          <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCx} />
        </FormField>
        <FormField label='Username'>
          <input type='text' value={username} onChange={(e) => setUsername(e.target.value)} required className={inputCx} />
        </FormField>
        {error && <p className='text-sm text-red-600'>{error}</p>}
        <p className='text-xs text-gray-600'>
          Davet maili gönderilir; kullanıcı /activate üzerinden şifresini belirleyene kadar <code>pending</code> kalır.
        </p>
        <ModalActions onCancel={onClose} submitLabel='Send invite' pending={mutation.isPending} />
      </form>
    </Modal>
  );
}

/* ── Affiliates tab (read-only) ─────────────────────────────────────── */

function AffiliatesTab({ id }: { id: string }) {
  const { data, isLoading, isError } = useBaseQuery<{ affiliates: AffiliateRow[] }>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_AFFILIATES_FOR(id),
    queryKey: ['platform-operator-affiliates', id],
  });

  if (isLoading) return <Card><p className='text-sm text-gray-600'>Loading…</p></Card>;
  if (isError) return <Card><p className='text-sm text-red-600'>Failed to load.</p></Card>;
  const rows = data?.affiliates || [];
  if (rows.length === 0) return <Card><p className='text-sm text-gray-600'>Operatörün hiç affiliate'i yok.</p></Card>;

  return (
    <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
      <table className='w-full'>
        <thead className='bg-gray-50 text-xs font-semibold text-gray-700'>
          <tr>
            <th className='px-4 py-2 text-left'>Name</th>
            <th className='px-4 py-2 text-left'>Email</th>
            <th className='px-4 py-2 text-left'>Username</th>
            <th className='px-4 py-2 text-left'>Status</th>
            <th className='px-4 py-2 text-left'>Tree</th>
            <th className='px-4 py-2 text-left'>Joined</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-100 text-xs text-gray-700'>
          {rows.map((a) => (
            <tr key={a._id}>
              <td className='px-4 py-2 font-medium'>{a.name}</td>
              <td className='px-4 py-2'>{a.email}</td>
              <td className='px-4 py-2 font-mono'>{a.username}</td>
              <td className='px-4 py-2'>{a.status}</td>
              <td className='px-4 py-2'>
                {a.parentAffiliateId && <span className='text-gray-500'>sub-aff</span>}
                {a.subAffiliateCount > 0 && (
                  <span className='ml-1 inline-flex rounded-full bg-violet-50 text-violet-700 px-2 py-0.5'>+{a.subAffiliateCount}</span>
                )}
                {!a.parentAffiliateId && a.subAffiliateCount === 0 && <span className='text-gray-400'>—</span>}
              </td>
              <td className='px-4 py-2'>{new Date(a.createdAt).toLocaleDateString('en-GB')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Billing tab (read-only) ────────────────────────────────────────── */

function BillingTab({ id }: { id: string }) {
  const { data, isLoading, isError } = useBaseQuery<BillingResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.GET_BILLING_FOR(id),
    queryKey: ['platform-operator-billing', id],
  });

  if (isLoading) return <Card><p className='text-sm text-gray-600'>Loading…</p></Card>;
  if (isError || !data) return <Card><p className='text-sm text-red-600'>Failed to load.</p></Card>;

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-violet-100 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs'>
        <Stat label='Status' value={data.billingStatus} />
        <Stat label='Plan' value={data.plan} />
        <Stat label='Next billing' value={data.nextBillingDate ? new Date(data.nextBillingDate).toLocaleDateString('en-GB') : '—'} />
        <Stat label='Trial ends' value={data.trialEndsAt ? new Date(data.trialEndsAt).toLocaleDateString('en-GB') : '—'} />
        <Stat label='Past-due since' value={data.pastDueAt ? new Date(data.pastDueAt).toLocaleDateString('en-GB') : '—'} />
        <Stat label='Discount' value={data.activeDiscountCode || '—'} mono />
      </div>

      <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
        <table className='w-full'>
          <thead className='bg-gray-50 text-xs font-semibold text-gray-700'>
            <tr>
              <th className='px-4 py-2 text-left'>Date</th>
              <th className='px-4 py-2 text-left'>Plan</th>
              <th className='px-4 py-2 text-left'>Amount USD</th>
              <th className='px-4 py-2 text-left'>Discount</th>
              <th className='px-4 py-2 text-left'>Status</th>
              <th className='px-4 py-2 text-left'>Reference</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-100 text-xs text-gray-700'>
            {data.transactions.length === 0 && (
              <tr><td colSpan={6} className='px-4 py-6 text-center text-gray-500'>Hiç transaction yok.</td></tr>
            )}
            {data.transactions.map((t) => (
              <tr key={t._id}>
                <td className='px-4 py-2'>{new Date(t.createdAt).toLocaleDateString('en-GB')}</td>
                <td className='px-4 py-2'>{t.plan}</td>
                <td className='px-4 py-2'>${t.amountUsd.toFixed(2)}</td>
                <td className='px-4 py-2 font-mono'>{t.discountCode ? `${t.discountCode} (-$${t.discountUsd?.toFixed(2) || 0})` : '—'}</td>
                <td className='px-4 py-2'>{t.status}</td>
                <td className='px-4 py-2 font-mono text-gray-500'>{t.referenceId || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Commission tab (read-only) ─────────────────────────────────────── */

function CommissionTab({ id }: { id: string }) {
  const { data, isLoading, isError } = useBaseQuery<{ plans: CommissionPlanRow[] }>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_COMMISSION_PLANS_FOR(id),
    queryKey: ['platform-operator-commission', id],
  });

  if (isLoading) return <Card><p className='text-sm text-gray-600'>Loading…</p></Card>;
  if (isError) return <Card><p className='text-sm text-red-600'>Failed to load.</p></Card>;
  const plans = data?.plans || [];
  if (plans.length === 0) return <Card><p className='text-sm text-gray-600'>Operatörün hiç commission plan'i yok.</p></Card>;

  return (
    <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
      <table className='w-full'>
        <thead className='bg-gray-50 text-xs font-semibold text-gray-700'>
          <tr>
            <th className='px-4 py-2 text-left'>Name</th>
            <th className='px-4 py-2 text-left'>Type</th>
            <th className='px-4 py-2 text-left'>Default</th>
            <th className='px-4 py-2 text-left'>Active</th>
            <th className='px-4 py-2 text-left'>Created</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-100 text-xs text-gray-700'>
          {plans.map((p) => (
            <tr key={p._id}>
              <td className='px-4 py-2 font-medium'>{p.name}</td>
              <td className='px-4 py-2'>{p.type || '—'}</td>
              <td className='px-4 py-2'>{p.isDefault ? 'Yes' : '—'}</td>
              <td className='px-4 py-2'>{p.isActive !== false ? 'Yes' : 'No'}</td>
              <td className='px-4 py-2'>{new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Shared primitives ─────────────────────────────────────────────── */

const inputCx =
  'w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary bg-white';

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className='block'>
      <span className='block text-xs font-medium text-gray-700 mb-1'>{label}</span>
      {children}
      {hint && <span className='block text-xs text-gray-500 mt-1'>{hint}</span>}
    </label>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className='bg-white rounded-xl border border-violet-100 p-6'>{children}</div>;
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className='text-xs text-gray-500'>{label}</div>
      <div className={`text-sm text-gray-800 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4' onClick={onClose}>
      <div className='bg-white rounded-xl shadow-xl border border-violet-100 max-w-md w-full p-5' onClick={(e) => e.stopPropagation()}>
        <h3 className='text-base font-semibold text-gray-900 mb-4'>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, submitLabel, pending }: { onCancel: () => void; submitLabel: string; pending: boolean }) {
  return (
    <div className='flex justify-end gap-2 pt-2'>
      <button type='button' onClick={onCancel} className='rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50'>
        Cancel
      </button>
      <button
        type='submit'
        disabled={pending}
        className='rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50'
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}
