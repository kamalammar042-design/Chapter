import { Logo } from '@/components/Logo';

/** Shown when the build has no Supabase configuration. */
export function NotConfigured() {
  return (
    <main className="page page--narrow" style={{ paddingTop: '14vh' }}>
      <div className="stack">
        <Logo />
        <h1 className="page-header__title">Chapter isn't connected yet</h1>
        <p className="text-2">
          This build has no server configuration. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>) and rebuild.
        </p>
      </div>
    </main>
  );
}
