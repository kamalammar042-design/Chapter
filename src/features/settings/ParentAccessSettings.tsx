import { useState } from 'react';
import { Copy, KeyRound, UserMinus, Users } from 'lucide-react';
import { useCreateInvite, useParentLinks, useRemoveLink } from '@/data/social';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/dates';

export function ParentAccessSettings() {
  const links = useParentLinks();
  const invite = useCreateInvite();
  const remove = useRemoveLink();
  const toast = useToast();
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const code = links.data?.invite;

  const copy = async (c: string) => {
    try { await navigator.clipboard.writeText(c); toast.success('Code copied'); } catch { toast.error('Copy failed. Select the code and copy it manually.'); }
  };

  return (
    <div className="stack-lg">
      <Card>
        <CardHeader title="Share progress with a parent" subtitle="A parent sees your activity, subject mastery, weak topics, goals and past-paper scores. Never your tutor chats, notes or flashcards." />
        <ul className="insights text-sm mb-4">
          <li>Your parent creates their own Chapter account and chooses "Parent".</li>
          <li>You generate a code here and give it to them. It works once and expires in 48 hours.</li>
          <li>You can remove their access at any time.</li>
        </ul>
        {links.isLoading ? <Skeleton height={40} /> : code ? (
          <div className="invite-code">
            <p className="text-xs text-3 fw-600">YOUR CODE</p>
            <p className="invite-code__value num" aria-label={`Invite code ${code.code.split('').join(' ')}`}>{code.code.slice(0, 4)}-{code.code.slice(4)}</p>
            <p className="text-xs text-3">Expires {relativeTime(code.expires_at)}</p>
            <div className="row mt-3">
              <Button size="sm" variant="secondary" icon={<Copy />} onClick={() => copy(code.code)}>Copy</Button>
              <Button size="sm" variant="ghost" loading={invite.isPending} onClick={() => invite.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>New code</Button>
            </div>
          </div>
        ) : (
          <Button icon={<KeyRound />} loading={invite.isPending} onClick={() => invite.mutate(undefined, {
            onError: (e) => toast.error(errorMessage(e)),
          })}>Generate a code</Button>
        )}
      </Card>

      <Card>
        <CardHeader title="Parents with access" />
        {links.isLoading ? <Skeleton height={48} /> : links.error ? <ErrorState compact error={links.error} onRetry={() => links.refetch()} /> : links.data?.parents.length ? (
          <ul className="list">
            {links.data.parents.map((p) => (
              <li key={p.parent_id} className="list__item">
                <span className="avatar avatar--sm" aria-hidden="true"><Users size={14} /></span>
                <div className="list__main">
                  <p className="list__title">{p.name}</p>
                  <p className="list__sub">{p.email_hint} · linked {relativeTime(p.linked_at)}</p>
                </div>
                <Button size="sm" variant="ghost" icon={<UserMinus />} onClick={() => setRemoving({ id: p.parent_id, name: p.name })}>Remove</Button>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title="No parents linked" body="Nobody else can see your progress." />}
      </Card>

      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? 'this parent'}?`} description="They will immediately lose access to your progress."
        footer={<>
          <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing.id, { onSuccess: () => { setRemoving(null); toast.success('Access removed'); }, onError: (e) => toast.error(errorMessage(e)) })}>Remove access</Button>
        </>} />
    </div>
  );
}
