import { Link, useNavigate } from 'react-router';
import { BookOpen, CalendarDays, ChevronRight, FileText, Flag, Layers, LogOut, NotebookPen, Settings, Trophy, Gauge } from 'lucide-react';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';

const ITEMS = [
  { to: '/papers', label: 'Past papers', desc: 'Library and your scores', icon: FileText },
  { to: '/flashcards', label: 'Flashcards', desc: 'Spaced-repetition review', icon: Layers },
  { to: '/notes', label: 'Notes', desc: 'Highlight & explain', icon: NotebookPen },
  { to: '/plan', label: 'Exam plan', desc: 'What to study each day', icon: CalendarDays },
  { to: '/goals', label: 'Goals', desc: 'Weekly and exam targets', icon: Flag },
  { to: '/reports', label: 'Weekly report', desc: 'Your week in numbers', icon: BookOpen },
  { to: '/leagues', label: 'Leagues', desc: 'XP, leaderboard, achievements', icon: Trophy },
  { to: '/settings/usage', label: 'Usage', desc: 'Your AI allowance this month', icon: Gauge },
  { to: '/settings', label: 'Settings', desc: 'Account, subjects, tutor, privacy', icon: Settings },
];

/** Mobile overflow menu for everything not in the bottom bar. */
export default function More() {
  useTitle('More');
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <Page width="narrow">
      <PageHeader title="More" />
      <Card flush>
        <ul className="list list--padded">
          {ITEMS.map((i) => (
            <li key={i.to}>
              <Link to={i.to} className="list__item">
                <span className="subject-icon subject-icon--sm" aria-hidden="true"><i.icon /></span>
                <span className="list__main"><span className="list__title" style={{ display: 'block' }}>{i.label}</span><span className="list__sub">{i.desc}</span></span>
                <ChevronRight size={18} className="text-3" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Button variant="ghost" icon={<LogOut />} className="mt-6" onClick={async () => { await signOut(); navigate('/', { replace: true }); }}>Sign out</Button>
    </Page>
  );
}
