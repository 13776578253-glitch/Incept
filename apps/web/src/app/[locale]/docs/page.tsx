import { SimpleShell } from '@/components/layouts/containers/simple-shell';
import { DocsHomeFeature } from '@/features/docs';

export default function DocsPage() {
  return (
    <SimpleShell>
      <DocsHomeFeature />
    </SimpleShell>
  );
}
