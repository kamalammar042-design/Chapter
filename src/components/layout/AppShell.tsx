import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  BarChart3, BookOpen, CalendarDays, FileText, Flag, GraduationCap, Home, Layers, LayoutGrid, NotebookPen,
  Settings, Shield, Sparkles, Trophy, Users, Flame,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { PageLoader } from '@/components/ui/States';
import { useProfile } from '@/data/profile';
import { currentStreak } from '@/lib/streak';
import { initials } from '@/lib/format';
import { useUser } from '@/features/auth/AuthProvider';
import { flushOutbox } from '@/data/attempts';
import { useIsAdmin } from '@/data/admin';
import { env } from '@/lib/env';

interface NavItem { to: string; label: string; icon: typeof Home; end?: boolean }

const STUDENT_PRIMARY: NavItem[] = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/study', label: 'Study', icon: GraduationCap },
  { to: '/tutor', label: 'AI Tutor', icon: Sparkles },
  { to: '/papers', label: 'Past papers', icon: FileText },
];
const STUDENT_TOOLS: NavItem[] = [
  { to: '/flashcards', label: 'Flashcards', icon: Layers },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/plan', label: 'Exam plan', icon: CalendarDays },
  { to: '/goals', label: 'Goals', icon: Flag },
];
const STUDENT_PROGRESS: NavItem[] = [
  { to: '/progress', label: 'Progress', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: BookOpen },
  { to: '/leagues', label: 'Leagues', icon: Trophy },
];
const MOBILE_STUDENT: NavItem[] = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/study', label: 'Study', icon: GraduationCap },
  { to: '/tutor', label: 'Tutor', icon: Sparkles },
  { to: '/progress', label: 'Progress', icon: BarChart3 },
  { to: '/more', label: 'More', icon: LayoutGrid },
];
const PARENT_NAV: NavItem[] = [
  { to: '/parent', label: 'Overview', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} className="nav-link">
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function AppShell() {
  const { data: profile } = useProfile();
  const user = useUser();
  const location = useLocation();
  const isParent = profile?.role === 'parent';
  const isAdmin = useIsAdmin().data === true;
  const streak = profile ? currentStreak(profile) : 0;
  const name = profile?.display_name || profile?.username || 'Student';
  // focus mode: no bottom navigation during a practice or review session
  const focus = /^\/(practice|review)/.test(location.pathname);

  // replay any answers recorded while offline
  useEffect(() => {
    const flush = () => void flushOutbox(user.id);
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [user.id]);

  // move focus to the page heading on navigation, for screen-reader users
  useEffect(() => {
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar__brand"><Logo size={26} /></div>
        <nav aria-label="Primary" className="stack-sm" style={{ gap: 2 }}>
          {isParent ? PARENT_NAV.map((i) => <SideLink key={i.to} item={i} />) : (
            <>
              {STUDENT_PRIMARY.map((i) => <SideLink key={i.to} item={i} />)}
              <p className="sidebar__section">Tools</p>
              {STUDENT_TOOLS.map((i) => <SideLink key={i.to} item={i} />)}
              <p className="sidebar__section">Progress</p>
              {STUDENT_PROGRESS.map((i) => <SideLink key={i.to} item={i} />)}
            </>
          )}
        </nav>
        <div className="sidebar__foot">
          {isAdmin && <SideLink item={{ to: '/admin', label: 'Content admin', icon: Shield }} />}
          {!isParent && <SideLink item={{ to: '/settings', label: 'Settings', icon: Settings }} />}
          <NavLink to="/settings/account" className="sidebar-user" aria-label={`Account: ${name}`}>
            <span className="avatar avatar--sm">{initials(name)}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="sidebar-user__name" style={{ display: 'block' }}>{name}</span>
              {!isParent && (
                <span className="sidebar-user__meta row-sm" style={{ gap: 4 }}>
                  <Flame size={12} aria-hidden="true" /> {streak}-day streak
                </span>
              )}
            </span>
          </NavLink>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <NavLink to={isParent ? '/parent' : '/home'} aria-label="Chapter home"><Logo size={24} /></NavLink>
          <div className="topbar__actions">
            {!isParent && (
              <span className="badge" aria-label={`${streak}-day streak`}>
                <Flame aria-hidden="true" /> {streak}
              </span>
            )}
            <NavLink to="/settings" className="btn btn--ghost btn--icon" aria-label="Settings">
              <Settings aria-hidden="true" />
            </NavLink>
          </div>
        </header>

        <main id="main" className={`main${focus ? ' main--focus' : ''}`}>
          {env.appEnv === 'preview' && <p className="env-banner" role="note">Preview environment: test data only</p>}
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {!focus && <nav className="bottom-nav" aria-label="Primary">
        {(isParent ? PARENT_NAV : MOBILE_STUDENT).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to}>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>}
    </div>
  );
}
