import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBaseQuery } from 'api/core/useBaseQuery';
import axiosInstance from 'config/axiosInstance';
import { OPERATOR_API_URLS, BRANDS_API_URLS } from 'config/apiUrls';

interface TeamBrand { _id: string; name: string }
interface TeamUser {
  _id: string;
  email: string;
  username: string;
  name: string;
  status: 'active' | 'pending' | 'inactive';
  isOwner: boolean;
  isSelf: boolean;
  brands: TeamBrand[];
}
interface TeamResponse { users: TeamUser[] }
interface BrandsResponse { brands: { _id: string; name: string }[] }

const STATUS_TONE: Record<string, string> = {
  active:   'bg-green-50 text-green-700',
  pending:  'bg-amber-50 text-amber-700',
  inactive: 'bg-gray-100 text-gray-600',
};

export default function Team() {
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<TeamUser | null>(null);

  const { data, isLoading } = useBaseQuery<TeamResponse>({
    endpoint: OPERATOR_API_URLS.TEAM(),
    queryKey: ['operator-team'],
  });
  const users = data?.users ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['operator-team'] });

  const remove = async (u: TeamUser) => {
    if (!confirm(`Remove ${u.name || u.email} from the team?`)) return;
    try {
      await axiosInstance.delete(OPERATOR_API_URLS.TEAM_MEMBER(u._id));
      refresh();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not remove user.');
    }
  };

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-semibold text-gray-800'>Team</h1>
          <p className='text-xs text-gray-600 mt-1'>
            Invite teammates and scope them to specific brands. Brand-scoped users only see
            their brands&apos; dashboard, reports and affiliates.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className='px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-dark'
        >
          Invite member
        </button>
      </div>

      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <p className='p-6 text-sm text-gray-700'>Loading…</p>}
        {!isLoading && users.length === 0 && (
          <p className='p-6 text-sm text-gray-700'>No team members yet.</p>
        )}
        {users.length > 0 && (
          <table className='w-full text-sm'>
            <thead>
              <tr className='bg-violet-50/60 text-left text-[11px] uppercase tracking-wider text-gray-700'>
                <th className='px-4 py-2.5 font-semibold'>Member</th>
                <th className='px-4 py-2.5 font-semibold'>Access</th>
                <th className='px-4 py-2.5 font-semibold'>Status</th>
                <th className='px-4 py-2.5 font-semibold text-right'>Actions</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-violet-50'>
              {users.map((u) => (
                <tr key={u._id}>
                  <td className='px-4 py-2.5'>
                    <div className='text-sm font-medium text-gray-900'>
                      {u.name || u.username}{u.isSelf && <span className='text-[11px] text-gray-500'> (you)</span>}
                    </div>
                    <div className='text-[11px] text-gray-600'>{u.email}</div>
                  </td>
                  <td className='px-4 py-2.5'>
                    {u.isOwner ? (
                      <span className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700'>
                        Owner · all brands
                      </span>
                    ) : (
                      <div className='flex flex-wrap gap-1'>
                        {u.brands.map((b) => (
                          <span key={b._id} className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700'>
                            {b.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className='px-4 py-2.5'>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[u.status]}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className='px-4 py-2.5 text-right'>
                    {!u.isOwner && !u.isSelf && (
                      <div className='flex items-center justify-end gap-1.5'>
                        <button
                          onClick={() => setEditing(u)}
                          className='px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-violet-50 hover:text-violet-700'
                        >
                          Edit brands
                        </button>
                        <button
                          onClick={() => remove(u)}
                          className='px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700'
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showInvite && <MemberModal onClose={() => setShowInvite(false)} onSaved={() => { setShowInvite(false); refresh(); }} />}
      {editing && <MemberModal member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}

function MemberModal({ member, onClose, onSaved }: { member?: TeamUser; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!member;
  const [name, setName] = useState(member?.name ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [username, setUsername] = useState(member?.username ?? '');
  const [brandIds, setBrandIds] = useState<string[]>(member ? member.brands.map((b) => b._id) : []);
  const [saving, setSaving] = useState(false);

  const { data } = useBaseQuery<BrandsResponse>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['team-modal-brands'],
  });
  const brands = data?.brands ?? [];

  const toggleBrand = (id: string) =>
    setBrandIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const canSubmit = useMemo(
    () => (isEdit || (name.trim() && email.trim() && username.trim())) && brandIds.length > 0 && !saving,
    [isEdit, name, email, username, brandIds, saving],
  );

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (isEdit) {
        await axiosInstance.patch(OPERATOR_API_URLS.TEAM_MEMBER(member!._id), { brandIds });
      } else {
        await axiosInstance.post(OPERATOR_API_URLS.TEAM(), {
          name: name.trim(),
          email: email.trim(),
          username: username.trim(),
          brandIds,
        });
      }
      onSaved();
    } catch (err: any) {
      alert(err?.response?.data?.error || (isEdit ? 'Could not update access.' : 'Could not send invite.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4' onClick={() => { if (!saving) onClose(); }}>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-md p-5 text-left' onClick={(e) => e.stopPropagation()}>
        <h3 className='text-sm font-semibold text-gray-900'>
          {isEdit ? `Edit brand access — ${member!.name || member!.username}` : 'Invite team member'}
        </h3>
        <p className='text-xs text-gray-600 mt-1'>
          {isEdit
            ? 'Update which brands this member can see. They are restricted to the selected brands.'
            : "They'll get an email to set a password, and will only see the brands you select."}
        </p>

        <div className='mt-3 space-y-3'>
          {!isEdit && (
            <>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className='w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary' />
              </div>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Email *</label>
                <input type='email' value={email} onChange={(e) => setEmail(e.target.value)}
                  className='w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary' />
              </div>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Username *</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)}
                  className='w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary' />
              </div>
            </>
          )}
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Brands *</label>
            {brands.length === 0 ? (
              <p className='text-xs text-amber-600'>You must create a brand first.</p>
            ) : (
              <div className='space-y-1.5 border border-gray-200 rounded-lg p-3 max-h-40 overflow-auto'>
                {brands.map((b) => (
                  <label key={b._id} className='flex items-center gap-2 text-xs text-gray-700 cursor-pointer'>
                    <input type='checkbox' checked={brandIds.includes(b._id)} onChange={() => toggleBrand(b._id)}
                      className='rounded border-gray-300 text-primary focus:ring-primary' />
                    <span className='font-medium'>{b.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className='mt-4 flex justify-end gap-2'>
          <button onClick={onClose} disabled={saving}
            className='px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40'>
            Cancel
          </button>
          <button onClick={submit} disabled={!canSubmit}
            className='px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary-dark disabled:opacity-40'>
            {saving ? '…' : isEdit ? 'Save' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  );
}
