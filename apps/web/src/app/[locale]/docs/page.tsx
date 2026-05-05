import { SimpleShell } from '@/components/layouts/containers/simple-shell';
import { DocsArchiveFeature } from '@/features/docs';

export default function DocsPage() {
  return (
    <SimpleShell>
      <DocsArchiveFeature />
    </SimpleShell>
  );
}
