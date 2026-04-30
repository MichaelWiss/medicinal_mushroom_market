'use client';

import { useState, useTransition } from 'react';
import {
  inviteTeamMember,
  removeTeamMember,
  setTeamMemberRole,
} from '@/app/actions/team';
import { useToast } from '@/components/ui/ToastProvider';
import type { TeamMember } from '@/lib/data/team';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export function TeamTable({
  members,
  currentUserId,
  isAdmin,
  origin,
}: {
  members: TeamMember[];
  currentUserId: string;
  isAdmin: boolean;
  origin: string;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'buyer'>('buyer');
  const [error, setError] = useState<string | null>(null);

  const submitInvite = () => {
    setError(null);
    if (!inviteEmail) {
      setError('Email is required.');
      return;
    }
    startTransition(async () => {
      const res = await inviteTeamMember(
        { email: inviteEmail, role: inviteRole },
        origin,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
    });
  };

  const changeRole = (membershipId: string, role: 'admin' | 'buyer') => {
    setError(null);
    startTransition(async () => {
      const res = await setTeamMemberRole({ membershipId, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast('Role updated');
    });
  };

  const remove = (membershipId: string, email: string) => {
    setError(null);
    if (!confirm(`Remove ${email} from the team?`)) return;
    startTransition(async () => {
      const res = await removeTeamMember({ membershipId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(`${email} removed`);
    });
  };

  return (
    <div className="mt-8 space-y-8">
      {isAdmin ? (
        <div className="border-[3px] border-dotted border-[color:var(--dot)] p-6">
          <div className="text-[10px] uppercase tracking-wider5 text-ink3">
            Invite a team member
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_160px_160px]">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="buyer@example.com"
              className="w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink"
              autoComplete="off"
            />
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as 'admin' | 'buyer')
              }
              className="w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink"
            >
              <option value="buyer">Buyer</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              className="bg-yellow px-5 py-2.5 text-[10px] uppercase tracking-wider3 text-navy hover:bg-yellow2 disabled:opacity-50"
              disabled={pending}
              onClick={submitInvite}
            >
              {pending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="border-[3px] border-dotted border-red-700 px-4 py-3 text-[12px] text-red-800"
        >
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto border-[3px] border-dotted border-[color:var(--dot)]">
        <table className="w-full text-[12px]">
          <thead className="text-left text-[10px] uppercase tracking-wider5 text-ink3">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              {isAdmin ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isMe = m.user_id === currentUserId;
              return (
                <tr
                  key={m.id}
                  className="border-t-[3px] border-dotted border-[color:var(--dot)]"
                >
                  <td className="px-4 py-3">
                    {m.email}
                    {isMe ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider5 text-ink3">
                        you
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && !isMe ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          changeRole(
                            m.id,
                            e.target.value as 'admin' | 'buyer',
                          )
                        }
                        disabled={pending}
                        className="border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-2 py-1 text-[12px] text-ink"
                      >
                        <option value="buyer">Buyer</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span>{m.role === 'admin' ? 'Admin' : 'Buyer'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{fmtDate(m.created_at)}</td>
                  {isAdmin ? (
                    <td className="px-4 py-3 text-right">
                      {!isMe ? (
                        <button
                          type="button"
                          onClick={() => remove(m.id, m.email)}
                          disabled={pending}
                          className="text-[10px] uppercase tracking-wider5 text-ink3 hover:text-red-700 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
