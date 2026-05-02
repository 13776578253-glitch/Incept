import { SimpleShell } from '@/components/layouts/containers/simple-shell';

export default function TestPage() {
  return (
    <SimpleShell>
      <div className="mx-auto flex min-h-[calc(100vh-var(--navbar-height))] w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.14em] text-[var(--color-nav-muted)]">
            Test Page
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--color-text)]">
            Interface Testing Surface
          </h1>
          <p className="max-w-3xl text-base leading-7 text-[var(--color-nav-dropdown-description)]">
            This page is reserved for temporary UI validation, layout checks,
            interaction experiments, and short notes while the main shells are
            still being refined.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-[20px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-6">
            <h2 className="text-lg font-medium text-[var(--color-text)]">
              Navigation Checks
            </h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-[var(--color-nav-dropdown-description)]">
              <li>Verify active nav states</li>
              <li>Verify dropdown hover hold behavior</li>
              <li>Check search and create entry spacing</li>
              <li>Review settings icon active treatment</li>
            </ul>
          </article>

          <article className="rounded-[20px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-6">
            <h2 className="text-lg font-medium text-[var(--color-text)]">
              Layout Checks
            </h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-[var(--color-nav-dropdown-description)]">
              <li>Validate top spacing under fixed navbar</li>
              <li>Check simple-shell content width</li>
              <li>Review light and dark contrast</li>
              <li>Confirm mobile header behavior</li>
            </ul>
          </article>
        </section>

        <section className="rounded-[24px] border border-dashed border-[var(--color-nav-dropdown-border)] p-8 text-sm leading-7 text-[var(--color-nav-dropdown-description)]">
          Add temporary notes, screenshots summary, or component experiments here
          while building the real page shells.
        </section>
      </div>
    </SimpleShell>
  );
}
