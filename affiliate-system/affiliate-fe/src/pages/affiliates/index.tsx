import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { AFFILIATES_API_URLS, OPERATOR_API_URLS, COMMISSION_API_URLS, BRANDS_API_URLS, ANNOUNCEMENTS_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import UpgradeBanner from '@components/core-components/UpgradeBanner';
import PlanBadge from '@components/core-components/PlanBadge';
import StyledSelect from '@components/core-components/StyledSelect';
import { useOperatorPlan } from 'hooks/useOperatorPlan';

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

type ProductScope = 'casino' | 'sportsbook' | 'combined';

interface CommissionPlan {
  _id: string;
  name: string;
  type: string;
  product?: ProductScope;
}

interface Affiliate {
  _id: string;
  email: string;
  username: string;
  name: string;
  status: string;
  mobileNumber?: string;
  mobileCountryCode?: string;
  website?: string | null;
  createdAt: string;
  referralCodes?: string[];
  // Legacy single-plan reference — kept for backward compat. Prefer
  // commissionPlans going forward.
  commissionPlanId?: CommissionPlan | null;
  commissionPlans?: {
    casino:     CommissionPlan | null;
    sportsbook: CommissionPlan | null;
    combined:   CommissionPlan | null;
  };
  parentAffiliate?: { _id: string; username: string; email: string; name: string } | null;
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
      {hint && <p className='text-xs text-gray-600 mt-1'>{hint}</p>}
    </div>
  );
}

// ── Plan type badge ───────────────────────────────────────────────────────────

function planTypeBadgeCls(type: string) {
  const map: Record<string, string> = {
    revshare:        'bg-violet-100 text-violet-700',
    cpa:             'bg-green-100 text-green-700',
    hybrid:          'bg-fuchsia-100 text-fuchsia-700',
    tiered_revshare: 'bg-warning-light text-warning',
  };
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[type] ?? 'bg-gray-100 text-gray-600'}`;
}

// ── Plan assign modal ─────────────────────────────────────────────────────────

function PlanAssignModal({
  affiliate, onClose, onSaved,
}: { affiliate: Affiliate; onClose: () => void; onSaved: () => void }) {
  // Three slots: casino / sportsbook / combined. Each stores the selected
  // plan id or '' for "no plan on this product".
  const initialSlots: Record<ProductScope, string> = {
    casino:     affiliate.commissionPlans?.casino?._id
              ?? (affiliate.commissionPlanId?.product === 'casino' ? affiliate.commissionPlanId._id : '')
              ?? '',
    sportsbook: affiliate.commissionPlans?.sportsbook?._id ?? '',
    combined:   affiliate.commissionPlans?.combined?._id ?? '',
  };
  // Legacy fallback: if none of the new slots are set but the old single
  // planId is, seed the casino slot with it (that's where resolveAffiliate
  // PlansByProduct routes a legacy casino plan).
  if (!initialSlots.casino && !initialSlots.sportsbook && !initialSlots.combined
      && affiliate.commissionPlanId?._id) {
    const legacyProduct = affiliate.commissionPlanId.product ?? 'casino';
    initialSlots[legacyProduct as ProductScope] = affiliate.commissionPlanId._id;
  }

  const [slots, setSlots] = useState<Record<ProductScope, string>>(initialSlots);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const { data: plans = [] } = useBaseQuery<CommissionPlan[]>({
    endpoint: COMMISSION_API_URLS.PLANS(),
    queryKey: ['commission-plans'],
  });

  // Per-slot: only plans whose own product matches that slot.
  const plansForSlot = (slot: ProductScope) =>
    plans.filter((p) => (p.product ?? 'casino') === slot);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await axiosInstance.patch(COMMISSION_API_URLS.AFFILIATE_PLAN(affiliate._id), {
        commissionPlans: {
          casino:     slots.casino     || null,
          sportsbook: slots.sportsbook || null,
          combined:   slots.combined   || null,
        },
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to assign plans');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-5'>
        <div>
          <h2 className='text-base font-semibold text-gray-800'>Assign Commission Plans</h2>
          <p className='text-xs text-gray-600 mt-0.5'>{affiliate.username} · {affiliate.email}</p>
          <p className='text-xs text-gray-700 mt-2'>
            Each product can have its own plan. Leaving a slot empty falls
            back to the operator&rsquo;s default plan for that product, or
            skips the commission entirely if no default is set.
          </p>
        </div>

        <div className='space-y-3'>
          {(['casino', 'sportsbook', 'combined'] as ProductScope[]).map((slot) => {
            const options = plansForSlot(slot);
            return (
              <div key={slot}>
                <label className='block text-xs font-medium text-gray-600 mb-1 capitalize'>{slot}</label>
                <StyledSelect
                  value={slots[slot]}
                  onChange={(v) => setSlots((s) => ({ ...s, [slot]: v }))}
                  placeholder='— none (use operator default) —'
                  options={[
                    { value: '', label: '— none (use operator default) —' },
                    ...options.map((p) => ({
                      value: p._id,
                      label: p.name,
                      description: p.type.replace('_', ' '),
                    })),
                  ]}
                />
                {options.length === 0 && (
                  <p className='text-[11px] text-gray-600 mt-1'>
                    No {slot} plans yet. Create one in the Commission page first.
                  </p>
                )}
              </div>
            );
          })}
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
    </div>,
    document.body,
  );
}

// ── Set parent modal ──────────────────────────────────────────────────────────

function SetParentModal({
  affiliate, affiliates, onClose, onSaved,
}: { affiliate: Affiliate; affiliates: Affiliate[]; onClose: () => void; onSaved: () => void }) {
  const [parentId, setParentId]       = useState<string>(affiliate.parentAffiliate?._id ?? '');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [upgradeBanner, setUpgradeBanner] = useState<{ message: string; currentPlan: string; requiredPlan: string } | null>(null);

  const { data: planData } = useBaseQuery<PlanResponse>({
    endpoint: OPERATOR_API_URLS.GET_PLAN(),
    queryKey: ['operator-plan'],
  });

  const subAffiliatesBlocked = planData && !planData.limits.subAffiliates;

  // Candidates: active affiliates that are not the affiliate itself.
  // Cycles are rejected server-side; we don't pre-filter ancestors here.
  const candidates = affiliates.filter(
    (a) => a._id !== affiliate._id && a.status === 'active',
  );

  async function handleSave() {
    setSaving(true);
    setError('');
    setUpgradeBanner(null);
    try {
      await axiosInstance.patch(AFFILIATES_API_URLS.SET_PARENT(affiliate._id), {
        parentAffiliateId: parentId || null,
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

  return createPortal(
    <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-5'>
        <div>
          <h2 className='text-base font-semibold text-gray-800'>Set Parent Affiliate</h2>
          <p className='text-xs text-gray-600 mt-0.5'>{affiliate.username} · {affiliate.email}</p>
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
                <StyledSelect
                  value={parentId}
                  onChange={(v) => setParentId(v)}
                  placeholder='— None (clear parent) —'
                  options={[
                    { value: '', label: '— None (clear parent) —' },
                    ...candidates.map((a) => ({
                      value: a._id,
                      label: a.username,
                      description: a.email,
                    })),
                  ]}
                />
                {candidates.length === 0 && (
                  <p className='text-xs text-gray-600 mt-1'>No eligible parent affiliates (active affiliates without a parent).</p>
                )}
                <p className='text-xs text-gray-600 mt-2'>
                  You only set the hierarchy here. The parent decides how to compensate
                  this affiliate from their own commission — revshare %, flat CPA per
                  FTD, or a hybrid — on their Sub-Affiliates page.
                </p>
              </div>
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
    </div>,
    document.body,
  );
}

// ── Affiliates list tab ───────────────────────────────────────────────────────

function AffiliatesTab() {
  const [assigningAffiliate, setAssigningAffiliate] = useState<Affiliate | null>(null);
  const [settingParent, setSettingParent]           = useState<Affiliate | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [announcing, setAnnouncing] = useState(false);

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
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
      <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
        <p className='text-sm font-medium text-gray-800'>Affiliates</p>
        <div className='flex items-center gap-3'>
          <button
            onClick={() => setAnnouncing(true)}
            className='text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5'
          >
            <span aria-hidden>📣</span> Announce
          </button>
          {planData && (
            <span className='text-xs text-gray-700 flex items-center gap-1.5'>
              {data?.total ?? 0} / {planData.limits.maxAffiliates} affiliates
              <PlanBadge plan={planData.plan} />
            </span>
          )}
          {!planData && <p className='text-xs text-gray-600'>{data?.total ?? 0} total</p>}
        </div>
      </div>

      {isLoading && <p className='text-sm text-gray-600 px-5 py-4'>Loading...</p>}

      {!isLoading && affiliates.length === 0 && (
        <p className='text-sm text-gray-600 px-5 py-6 text-center'>
          No affiliates yet. Add affiliates using the tabs above.
        </p>
      )}

      {affiliates.length > 0 && (() => {
        // Build hierarchy: roots = no parent OR parent not in this list, then their children indented
        const byParent = new Map<string, Affiliate[]>();
        const idSet = new Set(affiliates.map((a) => a._id));
        for (const a of affiliates) {
          const pid = a.parentAffiliate?._id && idSet.has(a.parentAffiliate._id)
            ? a.parentAffiliate._id
            : 'root';
          if (!byParent.has(pid)) byParent.set(pid, []);
          byParent.get(pid)!.push(a);
        }
        // Flatten in tree order with depth markers
        const ordered: { affiliate: Affiliate; depth: number }[] = [];
        const visit = (parentId: string, depth: number) => {
          const children = byParent.get(parentId) || [];
          for (const child of children) {
            ordered.push({ affiliate: child, depth });
            visit(child._id, depth + 1);
          }
        };
        visit('root', 0);

        return (
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-gray-50'>
              <tr>
                {['Name', 'Username', 'Email', 'Phone', 'Website', 'Status', 'Commission Plan', 'Parent', 'Joined'].map((h) => (
                  <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-100 last:border-r-0 whitespace-nowrap'>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map(({ affiliate: a, depth }, i) => (
                <tr key={a._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100'>
                    <div className='flex items-center' style={{ paddingLeft: `${depth * 20}px` }}>
                      {depth > 0 && (
                        <span className='text-gray-600 mr-2 select-none' aria-hidden>↳</span>
                      )}
                      <span>{a.name || '—'}</span>
                    </div>
                  </td>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100'>{a.username || '—'}</td>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100'>{a.email}</td>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100'>
                    {a.mobileCountryCode && a.mobileNumber
                      ? `${a.mobileCountryCode.startsWith('+') ? '' : '+'}${a.mobileCountryCode} ${a.mobileNumber}`
                      : '—'}
                  </td>
                  <td className='px-4 py-3 text-xs text-gray-700 border-r border-gray-100 max-w-[200px]'>
                    {a.website ? (
                      <a
                        href={/^https?:\/\//i.test(a.website) ? a.website : `https://${a.website}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-primary hover:underline break-all'
                      >
                        {a.website}
                      </a>
                    ) : '—'}
                  </td>
                  <td className='px-4 py-3 text-xs border-r border-gray-100'>
                    <div className='flex flex-col gap-1'>
                      <span className={`w-fit px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.status === 'active'  ? 'bg-green-100 text-green-700' :
                        a.status === 'pending' ? 'bg-warning-light text-warning' :
                                                 'bg-gray-100 text-gray-700'
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
                    {(() => {
                      const slots = a.commissionPlans;
                      const populated: { slot: ProductScope; plan: CommissionPlan }[] = [];
                      if (slots?.casino)     populated.push({ slot: 'casino',     plan: slots.casino });
                      if (slots?.sportsbook) populated.push({ slot: 'sportsbook', plan: slots.sportsbook });
                      if (slots?.combined)   populated.push({ slot: 'combined',   plan: slots.combined });
                      // Legacy fallback if no per-product slot is set
                      if (populated.length === 0 && a.commissionPlanId) {
                        populated.push({
                          slot: (a.commissionPlanId.product ?? 'casino') as ProductScope,
                          plan: a.commissionPlanId,
                        });
                      }
                      // Sub-affiliates earn through the parent's plan + the
                      // parent-set share rate (subPlan). Operators can't
                      // assign separate plans here — surface that explicitly
                      // instead of showing a Change button that the BE
                      // would reject.
                      const isSubAffiliate = !!a.parentAffiliate;
                      return (
                        <div className='flex flex-col gap-1'>
                          {populated.length === 0 && !isSubAffiliate && <span className='text-gray-600'>Default</span>}
                          {populated.map(({ slot, plan }) => (
                            <div key={slot} className='flex items-center gap-1'>
                              <span className='text-[10px] text-gray-600 uppercase tracking-wide w-14'>{slot}</span>
                              <span className={planTypeBadgeCls(plan.type)}>{plan.name}</span>
                            </div>
                          ))}
                          {isSubAffiliate ? (
                            <span className='text-[11px] text-gray-500 italic mt-0.5' title="Sub-affiliates are paid via the parent's commission plan and share rate.">
                              Managed by parent
                            </span>
                          ) : (
                            <button
                              onClick={() => setAssigningAffiliate(a)}
                              className='text-xs text-primary hover:underline text-left mt-0.5'
                            >
                              Change
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className='px-4 py-3 text-xs border-r border-gray-100'>
                    <div className='flex flex-col gap-0.5'>
                      {a.parentAffiliate ? (
                        <span className='text-gray-700 font-medium'>{a.parentAffiliate.username}</span>
                      ) : (
                        <span className='text-gray-600'>—</span>
                      )}
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
        );
      })()}

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

      {announcing && <AnnounceModal onClose={() => setAnnouncing(false)} />}
    </div>
  );
}

// ── Announcement broadcast modal ─────────────────────────────────────────────

function AnnounceModal({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ recipients: number; emailed: number } | null>(null);

  const { data: audience } = useBaseQuery<{ total: number; emailable: number }>({
    endpoint: ANNOUNCEMENTS_API_URLS.AUDIENCE(),
    queryKey: ['announce-audience'],
  });

  const send = async () => {
    if (!subject.trim() || !message.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const { data } = await axiosInstance.post(ANNOUNCEMENTS_API_URLS.BROADCAST(), { subject, message });
      setSent(data);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className='fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4' onClick={onClose}>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md' onClick={(e) => e.stopPropagation()}>
        <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
          <h2 className='text-base font-semibold text-gray-800'>📣 Announce to affiliates</h2>
          <button onClick={onClose} aria-label='Close' className='text-gray-400 hover:text-gray-600 text-lg leading-none'>×</button>
        </div>

        {sent ? (
          <div className='p-6 text-center space-y-3'>
            <p className='text-3xl'>✅</p>
            <p className='text-sm text-gray-800 font-medium'>Announcement sent.</p>
            <p className='text-xs text-gray-600'>
              In-app notification to <strong>{sent.recipients}</strong> affiliate{sent.recipients === 1 ? '' : 's'};
              emailed <strong>{sent.emailed}</strong> who have announcement emails on.
            </p>
            <button onClick={onClose} className='mt-2 h-9 px-5 rounded-lg text-sm font-medium text-white bg-primary'>Done</button>
          </div>
        ) : (
          <div className='p-5 space-y-3'>
            <p className='text-xs text-gray-600'>
              Sends an in-app notification to all your affiliates
              {audience ? <> — <strong>{audience.total}</strong> total, <strong>{audience.emailable}</strong> will also get an email</> : ''}.
            </p>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={150}
              placeholder='Subject (e.g. New payout schedule)'
              className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              rows={5}
              placeholder='Your message to all affiliates…'
              className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary resize-none'
            />
            {error && <p className='text-xs text-red-500'>{error}</p>}
            <div className='flex justify-end gap-2 pt-1'>
              <button onClick={onClose} className='h-9 px-4 rounded-lg text-sm text-gray-600 hover:bg-gray-100'>Cancel</button>
              <button
                onClick={send}
                disabled={sending || !subject.trim() || !message.trim()}
                className='h-9 px-5 rounded-lg text-sm font-medium text-white bg-primary disabled:opacity-40'
              >{sending ? 'Sending…' : `Send to ${audience?.total ?? ''} affiliates`}</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Add single affiliate tab ──────────────────────────────────────────────────

function AddAffiliateTab() {
  const [email, setEmail]       = useState('');
  const [username, setUsername] = useState('');
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [website, setWebsite]   = useState('');
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [result, setResult]     = useState<CreateResult | null>(null);
  const [error, setError]       = useState('');
  const [upgradeBanner, setUpgradeBanner] = useState<{ message: string; currentPlan: string; requiredPlan: string } | null>(null);
  // The invite is refused until the brand has a website URL — it's the base
  // of every tracking link, so an affiliate invited without one lands in a
  // portal that can't build them anything.
  const [brandUrlNotice, setBrandUrlNotice] = useState<string | null>(null);

  const { data: brandsData } = useBaseQuery<{ brands: { _id: string; name: string; url?: string }[] }>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['brands-add-affiliate'],
  });
  const brands = brandsData?.brands ?? [];

  const toggleBrand = (id: string) => {
    setSelectedBrandIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  };

  const { mutate, isPending } = useBaseMutation<CreateResult>({
    endpoint: AFFILIATES_API_URLS.CREATE(),
    method: 'post',
    onSuccess: (data) => {
      setResult(data);
      setUpgradeBanner(null);
      setBrandUrlNotice(null);
      setEmail(''); setUsername(''); setName(''); setPhone(''); setWebsite(''); setSelectedBrandIds([]);
    },
    onError: (e: any) => {
      const respData = e?.response?.data;
      if (respData?.code === 'BRAND_URL_REQUIRED') {
        setBrandUrlNotice(respData.error);
        setUpgradeBanner(null);
        setError('');
        return;
      }
      if (respData?.upgrade) {
        setUpgradeBanner({
          message: respData.error,
          currentPlan: respData.currentPlan,
          requiredPlan: respData.requiredPlan,
        });
        setError('');
      } else {
        setUpgradeBanner(null);
        setBrandUrlNotice(null);
        setError(respData?.error ?? e?.message ?? 'Failed to create affiliate');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setUpgradeBanner(null);
    setBrandUrlNotice(null);
    if (selectedBrandIds.length === 0) {
      setError('Select at least one brand');
      return;
    }
    mutate({
      email,
      username,
      name,
      mobileNumber: phone || undefined,
      website: website || undefined,
      brandIds: selectedBrandIds,
    });
  };

  return (
    <div className='max-w-lg space-y-6'>
      <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4'>
        <h2 className='text-sm font-semibold text-gray-800'>Add Affiliate</h2>
        <p className='text-xs text-gray-700'>
          Creates an account with <span className='font-medium'>pending</span> status.
          Share the activate link so they can set their password.
        </p>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <Field label='Full Name *'   value={name}     onChange={setName}     placeholder='Jane Doe' />
          <Field label='Email *'       value={email}    onChange={setEmail}    placeholder='jane@example.com' type='email' />
          <Field label='Username *'    value={username} onChange={setUsername} placeholder='jane_doe' />
          <Field label='Phone'         value={phone}    onChange={setPhone}    placeholder='+90 555 000 0000' />
          <Field label='Website'       value={website}  onChange={setWebsite}  placeholder='https://yoursite.com' />

          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Brands *</label>
            {brands.length === 0 ? (
              <p className='text-xs text-warning'>You must create a brand first.</p>
            ) : (
              <div className='space-y-1.5 border border-gray-200 rounded-lg p-3'>
                {brands.map((b) => (
                  <label key={b._id} className='flex items-center gap-2 text-xs text-gray-700 cursor-pointer'>
                    <input
                      type='checkbox'
                      checked={selectedBrandIds.includes(b._id)}
                      onChange={() => toggleBrand(b._id)}
                      className='rounded border-gray-300 text-primary focus:ring-primary'
                    />
                    <span className='font-medium'>{b.name}</span>
                    {b.url && <span className='text-gray-600'>— {b.url}</span>}
                  </label>
                ))}
              </div>
            )}
            <p className='text-xs text-gray-600 mt-1'>The affiliate gets one referral code per selected brand.</p>
          </div>

          {upgradeBanner && (
            <UpgradeBanner
              message={upgradeBanner.message}
              currentPlan={upgradeBanner.currentPlan}
              requiredPlan={upgradeBanner.requiredPlan}
            />
          )}

          {brandUrlNotice && (
            <div className='rounded-lg border border-amber-300 bg-amber-50 p-3'>
              <p className='text-xs text-amber-800'>{brandUrlNotice}</p>
              <a
                href='/brands'
                className='mt-1.5 inline-block text-xs font-medium text-amber-900 underline'
              >
                Go to Brands
              </a>
            </div>
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

const BULK_TEMPLATE = `email,username,name,mobileNumber,website,referralCodes
jane@example.com,jane_doe,Jane Doe,+905550000000,https://janedoe.com,CODE1
john@example.com,john_doe,John Doe,,,LEGACY_XYZ`;

function BulkImportTab() {
  const { limits } = useOperatorPlan();
  // Bulk affiliate import is an Affiliate Plus+ feature (BE: checkBulkImport).
  // While the plan loads (`limits` null) we allow it to avoid a flash.
  const bulkAllowed = limits ? limits.bulkImport : true;

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

  if (!bulkAllowed) {
    return (
      <div className='rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-8 text-center max-w-xl'>
        <div className='mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xl'>🔒</div>
        <h3 className='text-sm font-semibold text-gray-800'>Bulk affiliate import is a Plus feature</h3>
        <p className='mt-1 text-xs text-gray-600'>
          Upgrade to <b>Affiliate Plus</b> or higher to add affiliates in bulk from a CSV.
          You can still add affiliates one at a time on the <b>Add</b> tab.
        </p>
        <Link
          to='/billing'
          className='mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark'
        >
          Upgrade plan →
        </Link>
      </div>
    );
  }

  return (
    <div className='space-y-6 max-w-3xl'>
      <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-sm font-semibold text-gray-800'>Bulk Import</h2>
            <p className='text-xs text-gray-700 mt-0.5'>Upload a CSV with multiple affiliates at once (max 500 rows).</p>
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
          <p className='text-sm text-gray-700'>Click to upload CSV</p>
          <p className='text-xs text-gray-600 mt-1'>Columns: email, username, name, mobileNumber, website, referralCodes (semicolon-separated)</p>
          <input ref={fileRef} type='file' accept='.csv' onChange={handleFile} className='hidden' />
        </div>

        {preview.length > 0 && (
          <div className='space-y-3'>
            <p className='text-xs text-gray-600 font-medium'>{preview.length} rows detected</p>
            <div className='overflow-x-auto rounded-lg border border-gray-100'>
              <table className='w-full text-xs'>
                <thead className='bg-gray-50'>
                  <tr>
                    {['Email', 'Username', 'Name', 'Phone', 'Website', 'Codes'].map(h => (
                      <th key={h} className='px-3 py-2 text-left text-gray-700 font-medium border-r border-gray-100 last:border-r-0'>{h}</th>
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
                      <td className='px-3 py-2 border-r border-gray-100 break-all'>{row.website || '—'}</td>
                      <td className='px-3 py-2'>{Array.isArray(row.referralCodes) ? row.referralCodes.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 5 && <p className='text-xs text-gray-600'>...and {preview.length - 5} more rows</p>}

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
      <p className='text-xs text-gray-700 mb-4'>
        Share this link with affiliates to join your network.
      </p>

      {isLoading && <p className='text-sm text-gray-600'>Loading invite link...</p>}
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

  const { data: brandsData } = useBaseQuery<{ brands: { _id: string }[] }>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['brands-for-affiliates'],
  });
  const hasBrands = (brandsData?.brands?.length ?? 0) > 0;

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <h1 className='text-xl font-semibold text-gray-800'>Affiliates</h1>

      {!hasBrands && (
        <div className='bg-warning-light border border-warning/30 rounded-lg p-4 flex items-start gap-3'>
          <div className='shrink-0 w-8 h-8 rounded-full bg-warning/20 text-warning flex items-center justify-center text-sm font-bold'>!</div>
          <div className='flex-1'>
            <p className='text-sm font-semibold text-gray-800'>No brands yet</p>
            <p className='text-xs text-gray-600 mt-0.5'>
              You must create at least one brand before adding affiliates. Each affiliate will get a unique referral code per brand.
            </p>
            <Link
              to='/brands'
              className='inline-block mt-2 text-xs font-semibold text-primary hover:underline'
            >
              Go to Brands &rarr;
            </Link>
          </div>
        </div>
      )}

      <div className='flex gap-1 bg-white p-1 rounded-lg w-full border border-gray-200 shadow-sm'>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-white'
                : 'text-gray-700 hover:text-gray-700'
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
