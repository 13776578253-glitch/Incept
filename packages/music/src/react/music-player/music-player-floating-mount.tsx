'use client';

import { MusicPlayerFloating } from './components/music-player-floating';
import { createMusicPlayerRoutePolicy } from './adapter/player-route-policy';

// locale 集合与隐藏路由清单由宿主布局以 mount 配置传入；Phase 7 起改由 mount manifest 注册面提供
export function MusicPlayerFloatingMount(props: {
  locale: string;
  locales: readonly string[];
  hiddenRoutePrefixes: readonly string[];
}) {
  const policy = createMusicPlayerRoutePolicy({
    locales: props.locales,
    hiddenRoutePrefixes: props.hiddenRoutePrefixes,
  });

  return (
    <MusicPlayerFloating locale={props.locale} isHiddenRoute={policy.isMusicPlayerHiddenRoute} />
  );
}
