import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SectionPlaceholder } from './section-placeholder';

export function DeferredSection({ section, enabled, children }: {
  section: 'models' | 'costs' | 'projects'; enabled: boolean; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '320px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={root} className="dashboard-deferred-section">
    {enabled && visible ? children : <SectionPlaceholder section={section} />}
  </div>;
}
