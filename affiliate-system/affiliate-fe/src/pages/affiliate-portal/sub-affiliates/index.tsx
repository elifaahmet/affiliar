import { useMemo, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';
import { storageHelper } from 'utils/storage/StorageHelper';
import { STORAGE_KEYS } from 'utils/common/constants';

interface BrandReferralCode {
  code: string;
  brandId: string | null;
  brandName: string | null;
  brandUrl: string | null;
}

interface OverviewResponse {
  referralCodes: BrandReferralCode[];
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SubPlanType = 'revshare' | 'cpa' | 'hybrid';

interface SubPlan {
  type: SubPlanType;
  revshareRate: number;
  cpaSharePercent: number;
}

interface SubAffiliate {
  _id: string;
  username: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
  parentAffiliate: string | null;
  subPlan: SubPlan;
  referralCodes: string[];
  commission: {
    totalCents: number;
    paidCents: number;
    reportCount: number;
  };
}

interface SubAffiliatesResponse {
  subAffiliates: SubAffiliate[];
  total: number;
}

interface TreeNode {
  sub: SubAffiliate;
  depth: number;
  children: TreeNode[];
}

function buildTree(subs: SubAffiliate[], rootId: string): TreeNode[] {
  const childrenOf = new Map<string, SubAffiliate[]>();
  for (const s of subs) {
    const key = s.parentAffiliate ?? '';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(s);
  }
  function build(parentId: string, depth: number): TreeNode[] {
    return (childrenOf.get(parentId) ?? []).map((sub) => ({
      sub,
      depth,
      children: build(sub._id, depth + 1),
    }));
  }
  return build(rootId, 0);
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    out.push(n);
    out.push(...flattenTree(n.children));
  }
  return out;
}

export default function AffiliateSubAffiliates() {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);

  const callerId = useMemo(
    () => storageHelper.getStoreWithDecryption(STORAGE_KEYS.USER_ID) || '',
    [],
  );

  const { data, isLoading, isError } = useBaseQuery<SubAffiliatesResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.SUB_AFFILIATES(),
    queryKey: ['affiliate-sub-affiliates'],
  });

  const { data: overview } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-overview-subs'],
    params: {},
  });

  const subs = data?.subAffiliates ?? [];
  const referralCodes = overview?.referralCodes ?? [];

  const tree = useMemo(() => buildTree(subs, callerId), [subs, callerId]);
  const flatTree = useMemo(() => flattenTree(tree), [tree]);

  const directSubsCount = subs.filter((s) => s.parentAffiliate === callerId).length;
  const totalEarned = subs.reduce((s, a) => s + (a.commission?.totalCents ?? 0), 0);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const copyLink = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLink(text);
      setTimeout(() => setCopiedLink(null), 2000);
    });
  };

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>

      {/* Summary cards */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-700 mb-1'>Direct Sub-Affiliates</p>
          <p className='text-2xl font-semibold text-gray-800'>{directSubsCount}</p>
          <p className='text-xs text-gray-600 mt-0.5'>only direct children are editable</p>
        </div>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-700 mb-1'>Total in Subtree</p>
          <p className='text-2xl font-semibold text-gray-800'>{subs.length}</p>
          <p className='text-xs text-gray-600 mt-0.5'>across all depths</p>
        </div>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-700 mb-1'>Subtree Earnings (Total)</p>
          <p className='text-2xl font-semibold text-gray-800'>€{fmt(totalEarned)}</p>
          <p className='text-xs text-gray-600 mt-0.5'>paid downstream by parents</p>
        </div>
      </div>

      {/* Sub-affiliate tree */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
          <p className='text-sm font-semibold text-gray-800'>My Network</p>
          <p className='text-xs text-gray-600'>{subs.length} in subtree</p>
        </div>

        {isLoading && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-600'>Loading...</p>
          </div>
        )}

        {isError && (
          <div className='p-8 text-center'>
            <p className='text-sm text-red-500'>Failed to load sub-affiliates.</p>
          </div>
        )}

        {!isLoading && !isError && subs.length === 0 && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-600'>No sub-affiliates yet.</p>
            <p className='text-xs text-gray-600 mt-1'>Share your recruit link below to invite affiliates under your account.</p>
          </div>
        )}

        {!isLoading && !isError && subs.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  {['Affiliate', 'Status', 'Sub-Plan', 'Earned', 'Joined', ''].map((h) => (
                    <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap'>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {flatTree.map(({ sub, depth }, i) => {
                  const isDirect = sub.parentAffiliate === callerId;
                  const isEditing = editingSubId === sub._id;
                  return (
                    <SubRow
                      key={sub._id}
                      sub={sub}
                      depth={depth}
                      isDirect={isDirect}
                      isEditing={isEditing}
                      onEdit={() => setEditingSubId(sub._id)}
                      onCancel={() => setEditingSubId(null)}
                      onSaved={() => setEditingSubId(null)}
                      stripe={i % 2 === 0}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recruit link */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 space-y-3'>
        <h2 className='text-sm font-semibold text-gray-800'>Recruit Sub-Affiliates</h2>
        <p className='text-xs text-gray-700'>
          Share the link below to invite other affiliates under your account.
          You decide how to compensate them via the per-sub plan above. Both
          rates are a <b>share of your own commission</b> on that sub's
          subtree — so a sub can never be paid more than you earn on them.
        </p>

        {referralCodes.length === 0 ? (
          <div className='rounded-lg border border-dashed border-gray-200 p-4 text-center'>
            <p className='text-xs text-gray-600'>Contact your account manager to get your recruit link enabled.</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {referralCodes.map((rc) => {
              const link = `${baseUrl}/register?parentCode=${rc.code}`;
              const isCopied = copiedLink === link;
              return (
                <div key={rc.code} className='flex items-center gap-3 p-4 rounded-lg border border-gray-100 bg-gray-50'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-0.5'>
                      {rc.brandName && (
                        <span className='inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary uppercase tracking-wide'>
                          {rc.brandName}
                        </span>
                      )}
                      <p className='text-xs font-semibold text-gray-600'>
                        Code: <span className='font-mono text-primary'>{rc.code}</span>
                      </p>
                    </div>
                    <p className='text-xs text-gray-600 truncate font-mono'>{link}</p>
                  </div>
                  <button
                    onClick={() => copyLink(link)}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isCopied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-primary text-white hover:bg-primary-dark'
                    }`}
                  >
                    {isCopied ? 'Copied!' : 'Copy Recruit Link'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Row + editor ───────────────────────────────────────────────────────────────

function SubRow({
  sub, depth, isDirect, isEditing, onEdit, onCancel, onSaved, stripe,
}: {
  sub: SubAffiliate;
  depth: number;
  isDirect: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  stripe: boolean;
}) {
  return (
    <>
      <tr className={stripe ? 'bg-white' : 'bg-gray-50'}>
        <td className='px-4 py-3 text-xs text-gray-800'>
          <div className='flex items-center gap-2' style={{ paddingLeft: depth * 16 }}>
            {depth > 0 && (
              <span className='text-gray-600 select-none' aria-hidden>└──</span>
            )}
            <div>
              <p className='font-medium'>{sub.name || sub.username || '—'}</p>
              <p className='text-[11px] text-gray-600'>{sub.email}</p>
            </div>
          </div>
        </td>
        <td className='px-4 py-3'>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            sub.status === 'active'  ? 'bg-green-100 text-green-700' :
            sub.status === 'pending' ? 'bg-warning-light text-warning' :
                                       'bg-gray-100 text-gray-700'
          }`}>
            {sub.status}
          </span>
        </td>
        <td className='px-4 py-3 text-xs text-gray-700'>
          <SubPlanDisplay plan={sub.subPlan} muted={!isDirect} />
        </td>
        <td className='px-4 py-3 text-xs font-semibold text-gray-800'>
          €{fmt(sub.commission?.totalCents ?? 0)}
        </td>
        <td className='px-4 py-3 text-xs text-gray-700'>
          {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('en-GB') : '—'}
        </td>
        <td className='px-4 py-3 text-right'>
          {isDirect && !isEditing && (
            <button
              type='button'
              onClick={onEdit}
              className='text-xs font-medium text-primary hover:text-primary-dark'
            >
              Edit plan
            </button>
          )}
        </td>
      </tr>
      {isEditing && (
        <tr className={stripe ? 'bg-white' : 'bg-gray-50'}>
          <td colSpan={6} className='px-4 pb-4'>
            <SubPlanEditor sub={sub} onCancel={onCancel} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

function SubPlanDisplay({ plan, muted }: { plan: SubPlan; muted: boolean }) {
  const cls = muted ? 'text-gray-600' : 'text-gray-800';
  // Both rates are a share of the parent's commission on the sub's subtree.
  if (plan.type === 'revshare') {
    return <span className={cls}>{plan.revshareRate}% of revshare</span>;
  }
  if (plan.type === 'cpa') {
    return <span className={cls}>{plan.cpaSharePercent}% of CPA</span>;
  }
  return (
    <span className={cls}>
      {plan.revshareRate}% revshare + {plan.cpaSharePercent}% CPA
    </span>
  );
}

function SubPlanEditor({
  sub, onCancel, onSaved,
}: {
  sub: SubAffiliate;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<SubPlanType>(sub.subPlan.type);
  // Stored as strings so an empty input stays empty — using Number state
  // collapses '' → 0, which then re-renders as a leading "0" the user has
  // to delete every time. Parsed back on submit.
  const [revshareRate, setRevshareRate] = useState<string>(
    sub.subPlan.revshareRate ? String(sub.subPlan.revshareRate) : '',
  );
  const [cpaShare, setCpaShare] = useState<string>(
    sub.subPlan.cpaSharePercent ? String(sub.subPlan.cpaSharePercent) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useBaseMutation({
    endpoint: AFFILIATE_PORTAL_API_URLS.SUB_PLAN(sub._id),
    method: 'patch',
    invalidateKeys: ['affiliate-sub-affiliates'],
    onSuccess: () => onSaved(),
    onError: (err) => setError(err?.response?.data?.error ?? 'Failed to save'),
  });

  const showRev = type === 'revshare' || type === 'hybrid';
  const showCpa = type === 'cpa'       || type === 'hybrid';

  return (
    <div className='rounded-lg border border-primary/30 bg-white p-4 space-y-3'>
      <div className='flex flex-wrap items-end gap-4'>
        <label className='flex flex-col gap-1'>
          <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Plan type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SubPlanType)}
            className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary'
          >
            <option value='revshare'>Revshare</option>
            <option value='cpa'>CPA</option>
            <option value='hybrid'>Hybrid</option>
          </select>
        </label>
        {showRev && (
          <label className='flex flex-col gap-1'>
            <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Revshare share %</span>
            <input
              type='number'
              min={0}
              max={100}
              step='0.01'
              value={revshareRate}
              onChange={(e) => setRevshareRate(e.target.value)}
              className='w-28 bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary'
            />
          </label>
        )}
        {showCpa && (
          <label className='flex flex-col gap-1'>
            <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>CPA share %</span>
            <input
              type='number'
              min={0}
              max={100}
              step='0.01'
              value={cpaShare}
              onChange={(e) => setCpaShare(e.target.value)}
              className='w-28 bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary'
            />
          </label>
        )}
        <div className='flex gap-2 ml-auto'>
          <button
            type='button'
            onClick={onCancel}
            className='px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50'
          >
            Cancel
          </button>
          <button
            type='button'
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              const rate = Number(revshareRate) || 0;
              const cpaShareVal = Math.max(0, Math.min(100, Number(cpaShare) || 0));
              mutation.mutate({ type, revshareRate: rate, cpaSharePercent: cpaShareVal });
            }}
            className='px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-50'
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {error && <p className='text-xs text-red-500'>{error}</p>}
      <p className='text-[11px] text-gray-600'>
        Applied to <span className='font-medium'>{sub.username || sub.email}</span>'s entire subtree (their own players + any
        affiliates they recruit). Re-runs of the commission calc pick up the new rate from next month forward.
      </p>
    </div>
  );
}
