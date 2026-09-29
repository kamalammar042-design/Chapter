import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';

const calls: string[] = [];
let active = false;

vi.mock('@/features/auth/AuthProvider', () => ({
  useUser: () => ({ id: '3f2c1b9a-1d2e-4f5a-8b9c-0d1e2f3a4b5c', email: 's@example.com' }),
}));
vi.mock('@/data/social', () => ({ useSubscription: () => ({ data: { tier: 'parent', plus: active, active: [] } }) }));
vi.mock('@/lib/functions', () => ({ invokeFunction: async (name: string) => { calls.push(name); return { ok: true, plus: true }; } }));
vi.mock('@/lib/revenuecat', () => ({
  plusAvailable: true,
  loadPlus: async () => ({
    status: { active, willRenew: true, expiresAt: active ? new Date('2026-10-29T00:00:00Z') : null, managementURL: active ? 'https://billing.example/manage' : null },
    offer: active ? null : { pkg: { identifier: '$rc_monthly' }, title: 'Chapter Plus', price: '$3.99', period: 'month', sandbox: true },
  }),
  buyPlus: async () => { calls.push('purchase'); active = true; return { active: true, willRenew: true, expiresAt: new Date('2026-10-29T00:00:00Z'), managementURL: null }; },
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
}

describe('Chapter Plus card', () => {
  beforeEach(() => { calls.length = 0; active = false; });

  it('shows the live price and test-mode card, buys through RevenueCat and verifies on the server', async () => {
    const { PlusCard } = await import('@/features/settings/PlusCard');
    const user = userEvent.setup();
    wrap(<PlusCard />);
    const buy = await screen.findByRole('button', { name: 'Get Plus · $3.99 / month' });
    expect(screen.getByText(/Test mode: no real money is taken/)).toBeInTheDocument();
    expect(screen.getByText('Keeps Chapter free for every student')).toBeInTheDocument();
    await user.click(buy);
    await waitFor(() => expect(calls).toEqual(['purchase', 'revenuecat-sync']));
    expect(await screen.findByText(/You are a Plus supporter/)).toBeInTheDocument();
  });

  it('offers subscription management to an existing supporter', async () => {
    active = true;
    const { PlusCard } = await import('@/features/settings/PlusCard');
    wrap(<PlusCard />);
    expect(await screen.findByRole('link', { name: /Manage subscription/ })).toHaveAttribute('href', 'https://billing.example/manage');
    expect(screen.queryByRole('button', { name: /Get Plus/ })).not.toBeInTheDocument();
  });
});
