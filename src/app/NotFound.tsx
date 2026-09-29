import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { useTitle } from '@/components/layout/Page';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <main className="page page--narrow" style={{ paddingTop: '16vh' }}>
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={<Compass />}
        title="We couldn't find that page"
        body="The link may be broken, or the page may have moved."
        actions={<ButtonLink to="/">Back to Chapter</ButtonLink>}
      />
    </main>
  );
}
