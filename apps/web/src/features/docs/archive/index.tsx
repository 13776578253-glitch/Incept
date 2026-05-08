export function DocsArchiveFeature() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 py-16 md:px-8 md:py-20 xl:pr-10 xl:pl-[5.5rem] 2xl:pr-12 2xl:pl-[7.5rem]">
      <div className="mx-auto max-w-[920px] xl:pl-12 2xl:pl-16">
        <div className="max-w-3xl space-y-4">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
            Docs archive
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-5xl">
            Archive is being separated into its own surface.
          </h1>
          <p className="text-base leading-8 text-[var(--color-nav-dropdown-description)] md:text-[1.0625rem]">
            This route is reserved for chronological browsing and archive-specific
            navigation. The dedicated archive interface will be implemented next.
          </p>
        </div>
      </div>
    </div>
  );
}
