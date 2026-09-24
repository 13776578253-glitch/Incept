'use client';

import { MusicPlayerFloating } from './components/music-player-floating';
import { createMusicPlayerRoutePolicy } from './adapter/player-route-policy';

// locale 集合与隐藏路由清单由宿主布局以 mount 配置传入
// history: 路由配置原在布局中直传，现由 mount manifest 注册面统一提供
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
