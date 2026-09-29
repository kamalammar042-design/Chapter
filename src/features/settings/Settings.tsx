import { NavLink, Navigate, useParams } from 'react-router';
import { useProfile } from '@/data/profile';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { PageLoader } from '@/components/ui/States';
import { AccountSettings } from './AccountSettings';
import { StudySettings } from './StudySettings';
import { TutorSettings } from './TutorSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { PrivacySettings } from './PrivacySettings';
import { ParentAccessSettings } from './ParentAccessSettings';
import { UsageSettings } from './UsageSettings';

const STUDENT_SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'study', label: 'Study' },
  { id: 'tutor', label: 'AI tutor' },
  { id: 'usage', label: 'Usage & Plus' },
  { id: 'parents', label: 'Parent access' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'appearance', label: 'Appearance' },
] as const;

const PARENT_SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'appearance', label: 'Appearance' },
] as const;

export default function Settings() {
  const { section } = useParams();
  const { data: profile, isLoading } = useProfile();
  const sections = profile?.role === 'parent' ? PARENT_SECTIONS : STUDENT_SECTIONS;
  const current = sections.find((s) => s.id === section) ?? sections[0];
  useTitle(`Settings · ${current.label}`);

  if (section === 'plan') return <Navigate to="/settings/usage" replace />;
  if (isLoading || !profile) return <Page><PageLoader /></Page>;
  if (section && !sections.some((s) => s.id === section)) return <Navigate to="/settings" replace />;

  return (
    <Page width="narrow">
      <PageHeader title="Settings" />
      <nav className="tabs mb-6" aria-label="Settings sections">
        {sections.map((s) => (
          <NavLink key={s.id} to={`/settings/${s.id}`} aria-current={current.id === s.id ? 'page' : undefined}>{s.label}</NavLink>
        ))}
      </nav>
      <div className="fade-up" key={current.id}>
        {current.id === 'account' && <AccountSettings />}
        {current.id === 'study' && <StudySettings />}
        {current.id === 'tutor' && <TutorSettings />}
        {current.id === 'usage' && <UsageSettings />}
        {current.id === 'parents' && <ParentAccessSettings />}
        {current.id === 'privacy' && <PrivacySettings />}
        {current.id === 'appearance' && <AppearanceSettings />}
      </div>
    </Page>
  );
}
