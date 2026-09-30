import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, FlaskConical, Heart, Sparkles } from 'lucide-react';
import { useUser } from '@/features/auth/AuthProvider';
import { useSubscription } from '@/data/social';
import { qk } from '@/data/client';
import { invokeFunction } from '@/lib/functions';
import { errorMessage } from '@/lib/errors';
import { formatDay } from '@/lib/dates';
import { buyPlus, loadPlus, plusAvailable, type PlusOffer, type PlusStatus } from '@/lib/revenuecat';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const BENEFITS = [
  'Three times the AI tutor messages each month',
  'Three times the AI-generated questions and flashcards',
  'A Plus badge on your profile',
  'Keeps Chapter free for every student',
];

/**
 * Chapter Plus: an optional supporter subscription through RevenueCat Web
 * Billing. Everything else in Chapter stays free.
 */
export function PlusCard() {
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const sub = useSubscription();
  const [state, setState] = useState<{ status: PlusStatus; offer: PlusOffer | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Asks the server to verify with RevenueCat; true once the server has recorded Plus. */
  const refreshServer = async (): Promise<boolean> => {
    const res = await invokeFunction<{ plus?: boolean }>('revenuecat-sync', {});
    for (const k of [qk.subscription(user.id), qk.allowance(user.id, 'tutor_message'), qk.allowance(user.id, 'generate')]) {
      await qc.invalidateQueries({ queryKey: k });
    }
    return res?.plus === true;
  };

  useEffect(() => {
    if (!plusAvailable) return;
    let alive = true;
    loadPlus(user.id)
      .then((s) => { if (alive) setState(s); })
      .catch((e) => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, [user.id]);

  // RevenueCat says Plus is active but the server has not recorded it yet
  // (for example a delayed webhook): ask the server to verify now.
  useEffect(() => {
    if (state?.status.active && sub.data && !sub.data.plus) void refreshServer().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status.active, sub.data?.plus]);

  if (!plusAvailable) return null;

  const buy = async () => {
    if (!state?.offer) return;
    setBusy(true);
    setError(null);
    try {
      const status = await buyPlus(user.id, state.offer.pkg, user.email);
      if (status) {
        setState({ ...state, status });
        const recorded = await refreshServer().catch(() => false);
        if (recorded) toast.success('Welcome to Chapter Plus. Thank you for supporting Chapter.');
        else toast.show('Purchase received. Confirming it with RevenueCat…');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const status = state?.status;
  const offer = state?.offer;
  // The server is the source of truth: "supporter" only once it has verified
  // the purchase, so the page never claims Plus before the allowance changes.
  const serverPlus = sub.data?.plus === true;

  return (
    <Card accent className="plus-card">
      <CardHeader
        title={<span className="row-sm"><Sparkles size={18} className="text-primary" aria-hidden="true" /> Chapter Plus</span>}
        subtitle="Chapter is free for every student. Plus is an optional subscription for anyone who wants more AI help, and it funds Chapter's AI costs."
        action={status?.active && serverPlus ? <Badge tone="primary" icon={<Heart />}>Supporter</Badge> : <Badge outline>Optional</Badge>}
      />
      {!state && !error ? <Skeleton height={120} /> : (
        <div className="stack">
          <ul className="plus-benefits">
            {BENEFITS.map((b) => <li key={b}><Check size={15} aria-hidden="true" /> {b}</li>)}
          </ul>

          {status?.active && !serverPlus ? (
            <div className="stack-sm">
              <p className="text-sm text-2 row-sm"><span className="spinner" aria-hidden="true" /> Confirming your purchase with RevenueCat…</p>
              <Button variant="secondary" size="sm" style={{ width: 'fit-content' }} loading={busy}
                onClick={() => { setBusy(true); void refreshServer().catch(() => false).finally(() => setBusy(false)); }}>Check again</Button>
            </div>
          ) : status?.active ? (
            <div className="stack-sm">
              <p className="text-sm text-2">
                You are a Plus supporter{status.expiresAt ? ` · ${status.willRenew ? 'renews' : 'ends'} ${formatDay(status.expiresAt.toISOString().slice(0, 10), { day: 'numeric', month: 'long' })}` : ''}.
              </p>
              {status.managementURL && (
                <a className="btn btn--secondary btn--sm" href={status.managementURL} target="_blank" rel="noopener noreferrer" style={{ width: 'fit-content' }}>
                  Manage subscription <ExternalLink aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
          ) : offer ? (
            <div className="stack-sm">
              <Button icon={<Sparkles />} onClick={buy} loading={busy} style={{ width: 'fit-content' }}>
                Get Plus · {offer.price}{offer.period ? ` / ${offer.period}` : ''}
              </Button>
              {offer.mode === 'test_store' ? (
                <Alert tone="info" icon={<FlaskConical />}>
                  Test mode: RevenueCat's Test Store simulates the purchase, so nothing is charged. In the window that opens, choose <strong>Test valid purchase</strong>.
                </Alert>
              ) : (
                <p className="text-xs text-3">Payments are handled securely by RevenueCat and Stripe. Cancel any time; Plus lasts until the end of the period you paid for.</p>
              )}
              {offer.mode === 'sandbox' && (
                <Alert tone="info" icon={<FlaskConical />}>
                  Test mode: no real money is taken. Use card <strong className="num">4242 4242 4242 4242</strong>, any future expiry date and any CVC.
                </Alert>
              )}
            </div>
          ) : !error ? (
            <p className="text-sm text-2">Chapter Plus is not available to buy right now.</p>
          ) : null}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      )}
    </Card>
  );
}
