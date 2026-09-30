import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { deadSubscriptions, reminderKey, reminderMessage } from '../../supabase/functions/_shared/reminders';

describe('reminder messages', () => {
  it('says only how many skills are due and links to review', () => {
    expect(reminderMessage(1, 'https://chapter.example/')).toEqual({
      headings: { en: 'Time for a quick review' },
      contents: { en: '1 skill is ready to review. A few minutes now keeps them fresh.' },
      web_url: 'https://chapter.example/review',
    });
    expect(reminderMessage(4, 'https://chapter.example').contents.en).toMatch(/^4 skills are ready/);
  });

  it('uses one stable idempotency key per student per day', async () => {
    const a = await reminderKey('u1', '2026-10-05');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await reminderKey('u1', '2026-10-05')).toBe(a);
    expect(await reminderKey('u1', '2026-10-06')).not.toBe(a);
    expect(await reminderKey('u2', '2026-10-05')).not.toBe(a);
  });

  it('finds undeliverable subscriptions in OneSignal errors', () => {
    const sent = ['aaaa', 'bbbb'];
    expect(deadSubscriptions({ invalid_player_ids: ['bbbb'] }, sent)).toEqual(['bbbb']);
    expect(deadSubscriptions({ invalid_aliases: { subscription_id: ['aaaa', 'zzzz'] } }, sent)).toEqual(['aaaa']);
    expect(deadSubscriptions(['All included players are not subscribed'], sent)).toEqual([]);
    expect(deadSubscriptions(undefined, sent)).toEqual([]);
  });
});

// ---- settings card ------------------------------------------------------
const rpc = vi.fn();
let permissionProblem: string | null = null;

vi.mock('@/features/auth/AuthProvider', () => ({ useUser: () => ({ id: 'u1', email: 's@example.com' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/lib/push', async () => {
  class PushError extends Error { constructor(readonly problem: string) { super(problem); } }
  return {
    pushConfigured: true,
    pushSupport: () => 'ok',
    PushError,
    enablePush: async () => { if (permissionProblem) throw new PushError(permissionProblem); return '6b1f4a2e-3c5d-4e7f-8a9b-0c1d2e3f4a5b'; },
    disablePush: async () => {},
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
}

describe('Review reminders card', () => {
  beforeEach(() => {
    rpc.mockReset();
    permissionProblem = null;
    let state = { enabled: false, hour: 17, devices: 0, timezone: 'Asia/Dubai' };
    rpc.mockImplementation(async (name: string, args?: { p_enabled: boolean; p_hour: number }) => {
      if (name === 'set_reminders') state = { ...state, enabled: args!.p_enabled, hour: args!.p_hour, devices: args!.p_enabled ? 1 : 0 };
      return { data: state, error: null };
    });
  });

  it('turns reminders on with this browser and off again', async () => {
    const { RemindersCard } = await import('@/features/settings/RemindersCard');
    const user = userEvent.setup();
    wrap(<RemindersCard />);
    const toggle = await screen.findByRole('switch', { name: 'Review reminders' });
    expect(screen.getByText(/Asia\/Dubai|Asia Dubai/)).toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_reminders', { p_enabled: true, p_hour: 17, p_subscription: '6b1f4a2e-3c5d-4e7f-8a9b-0c1d2e3f4a5b' }));
    expect(await screen.findByText(/On for this browser/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Review reminders' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_reminders', { p_enabled: false, p_hour: 17 }));
  });

  it('explains blocked notifications instead of failing silently', async () => {
    permissionProblem = 'denied';
    const { RemindersCard } = await import('@/features/settings/RemindersCard');
    const user = userEvent.setup();
    wrap(<RemindersCard />);
    await user.click(await screen.findByRole('switch', { name: 'Review reminders' }));
    expect(await screen.findByText(/blocked for Chapter in your browser settings/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('set_reminders', expect.anything());
  });
});
