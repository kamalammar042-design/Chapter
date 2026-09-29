import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Award, Crown, Info, Lock, Trophy, UserRound, AlertCircle } from 'lucide-react';
import { useProfile, useUpdateProfile } from '@/data/profile';
import { useActivity, useTopicStats } from '@/data/progress';
import { useLeaderboard } from '@/data/social';
import { usePaperAttempts } from '@/data/study';
import { Page, PageHeader, Section, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/Progress';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { LEAGUES, LEAGUE_COLORS, leagueFor } from '@/lib/league';
import { evaluateAchievements } from '@/lib/achievements';
import { formatDay } from '@/lib/dates';
import { fmtInt } from '@/lib/format';
import { errorMessage, toAppError } from '@/lib/errors';

export default function Leagues() {
  useTitle('Leagues');
  const profile = useProfile();
  const board = useLeaderboard();
  const stats = useTopicStats();
  const activity = useActivity();
  const papers = usePaperAttempts();
  const [nameOpen, setNameOpen] = useState(false);

  const xp = profile.data?.xp ?? 0;
  const league = leagueFor(xp);
  const achievements = useMemo(() => evaluateAchievements({
    xp,
    longestStreak: profile.data?.longest_streak ?? 0,
    stats: stats.data ?? [],
    papersLogged: papers.data?.length ?? 0,
    cardsReviewed: (activity.data ?? []).reduce((s, a) => s + a.reviews, 0),
  }), [xp, profile.data, stats.data, papers.data, activity.data]);
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const lb = board.data;

  return (
    <Page>
      <PageHeader title="Leagues" subtitle="XP comes from answering questions correctly, so it reflects real learning, not time spent in the app." />

      <div className="grid-2">
        <Card className="league-card">
          <div className="row">
            <span className="league-badge" style={{ '--c': LEAGUE_COLORS[league.current.name] } as React.CSSProperties} aria-hidden="true"><Trophy /></span>
            <div className="grow">
              <p className="text-sm text-3">Your league</p>
              <p className="text-xl fw-600">{league.current.name}</p>
              <p className="text-sm text-2 num">{fmtInt(xp)} XP</p>
            </div>
          </div>
          {league.next ? (
            <div className="mt-4 stack-sm">
              <ProgressBar value={league.progress} label={`Progress to ${league.next.name}`} />
              <p className="text-xs text-3 num">{fmtInt(league.toNext)} XP to {league.next.name}</p>
            </div>
          ) : <p className="text-sm text-2 mt-4">You've reached the top league.</p>}
          <ol className="league-ladder" aria-label="League ladder">
            {LEAGUES.map((l) => (
              <li key={l.name} className={xp >= l.at ? 'is-reached' : ''} title={`${l.name}: ${fmtInt(l.at)} XP`}>
                <span style={{ background: xp >= l.at ? LEAGUE_COLORS[l.name] : undefined }} />
                <span className="sr-only">{l.name}, {fmtInt(l.at)} XP{xp >= l.at ? ', reached' : ''}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <h2 className="card__title row-sm"><Info size={16} aria-hidden="true" /> How XP works</h2>
          <ul className="insights mt-3 text-sm">
            <li>Correct answers earn 10 XP (easy), 20 XP (medium) or 35 XP (hard).</li>
            <li>Wrong answers earn nothing, but they shape your next practice set.</li>
            <li>Every 7th consecutive study day adds a consistency bonus.</li>
            <li>A study day needs 5 answered questions or 10 flashcard reviews.</li>
          </ul>
        </Card>
      </div>

      <Section title="This week's leaderboard" id="lb-h" action={lb && <span className="text-xs text-3">{formatDay(lb.week_start)} – {formatDay(lb.week_end)} · resets Monday</span>}>
        <Card flush>
          {profile.data && !profile.data.username && (
            <div className="row row--between row--wrap" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm text-2 row-sm"><UserRound size={16} aria-hidden="true" /> Choose a username to appear on the leaderboard.</p>
              <Button size="sm" variant="secondary" onClick={() => setNameOpen(true)}>Choose username</Button>
            </div>
          )}
          {profile.data && profile.data.username && !profile.data.leaderboard_opt_in && (
            <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm text-2 row-sm"><Lock size={16} aria-hidden="true" /> You're hidden from others. <Link to="/settings/privacy" className="text-primary">Change in Settings</Link></p>
            </div>
          )}
          {board.isLoading ? <div className="stack" style={{ padding: 20 }}><Skeleton height={36} /><Skeleton height={36} /></div> : board.error ? (
            <ErrorState compact error={board.error} onRetry={() => board.refetch()} />
          ) : lb && lb.entries.length > 0 && lb.entries.some((e) => !e.is_me) ? (
            <ol className="list list--padded leaderboard">
              {lb.entries.map((e) => (
                <li key={`${e.rank}-${e.username}`} className={`list__item${e.is_me ? ' is-me' : ''}`}>
                  <span className={`lb-rank num${e.rank <= 3 ? ' lb-rank--top' : ''}`}>{e.rank <= 3 ? <Crown size={14} aria-hidden="true" /> : null}{e.rank}</span>
                  <span className="list__main fw-500">{e.username}{e.is_me && <span className="text-3 fw-500"> (you)</span>}</span>
                  <span className="num text-2">{fmtInt(e.xp)} XP</span>
                </li>
              ))}
              {lb.me && !lb.entries.some((e) => e.is_me) && (
                <li className="list__item is-me">
                  <span className="lb-rank num">{lb.me.rank}</span>
                  <span className="list__main fw-500">You</span>
                  <span className="num text-2">{fmtInt(lb.me.xp)} XP</span>
                </li>
              )}
            </ol>
          ) : (
            <EmptyState compact icon={<Trophy />} title="No one else on the board yet this week"
              body={`${lb?.program === 'sat' ? 'SAT' : 'IGCSE'} students who earn XP this week and have a username appear here. Your weekly XP so far: ${fmtInt(lb?.me?.xp ?? 0)}.`} />
          )}
        </Card>
      </Section>

      <Section title={`Achievements · ${unlocked} of ${achievements.length}`} id="ach-h">
        <div className="grid-auto">
          {achievements.map((a) => (
            <Card key={a.id} tight className={`achievement${a.unlocked ? ' is-unlocked' : ''}`}>
              <div className="row">
                <span className="achievement__icon" aria-hidden="true"><Award /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row row--between">
                    <p className="fw-600 text-sm">{a.title}</p>
                    {a.unlocked && <Badge tone="success">Earned</Badge>}
                  </div>
                  <p className="text-xs text-3">{a.description}</p>
                  {!a.unlocked && (
                    <div className="mt-2 stack-sm" style={{ gap: 4 }}>
                      <ProgressBar value={a.current} max={a.target} size="sm" label={`${a.title} progress`} />
                      <p className="text-xs text-3 num">{fmtInt(a.current)} / {fmtInt(a.target)}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {nameOpen && <UsernameDialog onClose={() => setNameOpen(false)} />}
    </Page>
  );
}

export function UsernameDialog({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();
  const [value, setValue] = useState(profile.data?.username ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const v = value.trim();
    if (!/^[A-Za-z0-9_.]{3,24}$/.test(v)) return setError('3–24 characters: letters, numbers, dots and underscores.');
    update.mutate({ username: v }, {
      onSuccess: () => { toast.success('Username saved'); onClose(); },
      onError: (e) => setError(toAppError(e).code === 'conflict' ? 'That username is taken.' : errorMessage(e)),
    });
  };

  return (
    <Dialog open onClose={onClose} busy={update.isPending} title="Choose a username" description="Shown on leaderboards instead of your name. Don't use your real full name."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={update.isPending}>Save</Button></>}>
      {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
      <Field label="Username" hint="Letters, numbers, dots and underscores.">
        <Input value={value} maxLength={24} autoComplete="off" onChange={(e) => setValue(e.target.value)} data-autofocus />
      </Field>
    </Dialog>
  );
}
