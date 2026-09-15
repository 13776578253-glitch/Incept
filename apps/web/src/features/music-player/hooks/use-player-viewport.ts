'use client';

import { useEffect, useState } from 'react';

export type PlayerViewportMode = 'mobile' | 'desktop';

const mobileQuery = '(max-width: 767px)';

export function usePlayerViewport(): { mode: PlayerViewportMode; isReady: boolean } {
  const [mode, setMode] = useState<PlayerViewportMode>('desktop');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(mobileQuery);
    const update = () => setMode(query.matches ? 'mobile' : 'desktop');

    update();
    setIsReady(true);
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return { mode, isReady };
}
