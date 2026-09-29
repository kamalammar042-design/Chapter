import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { reportError } from '@/lib/telemetry';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button, ButtonLink } from '@/components/ui/Button';

/**
 * Last-resort error screen. A failed lazy chunk usually means a new version
 * was deployed while the tab was open; reloading fixes it.
 */
export function RouteError() {
  const error = useRouteError();
  const chunkFailed = error instanceof Error && /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message);
  if (import.meta.env.DEV) console.error(error);
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  useEffect(() => {
    if (!notFound) reportError(chunkFailed ? 'chunk_load_failed' : 'route_error', error, chunkFailed ? 'warn' : 'error');
  }, [error, notFound, chunkFailed]);

  return (
    <div className="page page--narrow" style={{ paddingTop: '14vh' }}>
      <div className="stack" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <Logo />
        <div className="state__icon state__icon--danger" aria-hidden="true"><AlertTriangle /></div>
        <h1 className="page-header__title">
          {notFound ? 'Page not found' : chunkFailed ? 'Chapter has been updated' : 'Something went wrong'}
        </h1>
        <p className="text-2" style={{ maxWidth: '44ch' }}>
          {chunkFailed
            ? 'A newer version is available. Reload to continue where you left off.'
            : notFound
              ? 'That page does not exist.'
              : 'An unexpected error occurred. Reloading usually fixes it. Your progress is saved on our servers.'}
        </p>
        <div className="row">
          <Button icon={<RefreshCw />} onClick={() => window.location.reload()}>Reload</Button>
          <ButtonLink to="/" variant="secondary">Go home</ButtonLink>
        </div>
      </div>
    </div>
  );
}
