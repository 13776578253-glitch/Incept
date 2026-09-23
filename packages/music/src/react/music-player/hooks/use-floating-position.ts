'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type PlayerViewMode = 'orb' | 'compact' | 'expanded';

export type FloatingEdge = 'left' | 'right';

export type FloatingPlacement = {
  edge: FloatingEdge;
  offsetRatio: number;
  mode: PlayerViewMode;
};

export type FloatingGeometry = {
  left: number;
  top: number;
};

export type ElementSize = {
  width: number;
  height: number;
};

// 保存悬浮块的 UI 位置
export const MUSIC_PLAYER_PLACEMENT_STORAGE_KEY = 'incept-music-player:v1:floating-ui';

// 比例映射到底边锚定区间：1 贴底边，与左右留同样的 20px
export const DEFAULT_FLOATING_PLACEMENT: FloatingPlacement = {
  edge: 'right',
  offsetRatio: 1,
  mode: 'compact',
};

const edgeMargin = 20;
const navbarGap = 12;
const dragThresholdPixels = 4;

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

// 垂直方向锚定底边，比例基于视口高度而非元素高度
export function resolveFloatingGeometry(
  placement: FloatingPlacement,
  size: ElementSize,
  viewport: ElementSize,
  navbarOffset: number,
): FloatingGeometry {
  const minTop = navbarOffset + navbarGap;
  const maxBottom = viewport.height - edgeMargin;
  const bottomSpan = Math.max(0, maxBottom - minTop);
  const desiredBottom = minTop + clampRatio(placement.offsetRatio) * bottomSpan;
  const top = Math.min(
    Math.max(desiredBottom - size.height, minTop),
    Math.max(minTop, maxBottom - size.height),
  );

  return {
    left: placement.edge === 'left' ? edgeMargin : Math.max(edgeMargin, viewport.width - size.width - edgeMargin),
    top,
  };
}

export function resolveFloatingPlacement(
  geometry: FloatingGeometry,
  size: ElementSize,
  viewport: ElementSize,
  navbarOffset: number,
  mode: PlayerViewMode,
): FloatingPlacement {
  const minTop = navbarOffset + navbarGap;
  const maxBottom = viewport.height - edgeMargin;
  const bottomSpan = Math.max(0, maxBottom - minTop);
  const bottom = Math.min(Math.max(geometry.top + size.height, minTop), maxBottom);
  const centerX = geometry.left + size.width / 2;

  return {
    edge: centerX < viewport.width / 2 ? 'left' : 'right',
    offsetRatio: bottomSpan <= 0 ? 0 : clampRatio((bottom - minTop) / bottomSpan),
    mode,
  };
}

export function clampGeometry(
  geometry: FloatingGeometry,
  size: ElementSize,
  viewport: ElementSize,
  navbarOffset: number,
): FloatingGeometry {
  const minTop = navbarOffset + navbarGap;
  const maxTop = Math.max(minTop, viewport.height - size.height - edgeMargin);
  const maxLeft = Math.max(edgeMargin, viewport.width - size.width - edgeMargin);

  return {
    left: Math.min(Math.max(geometry.left, edgeMargin), maxLeft),
    top: Math.min(Math.max(geometry.top, minTop), maxTop),
  };
}

function isPlayerViewMode(value: unknown): value is PlayerViewMode {
  return value === 'orb' || value === 'compact' || value === 'expanded';
}

function isFloatingEdge(value: unknown): value is FloatingEdge {
  return value === 'left' || value === 'right';
}

export function parseStoredPlacement(raw: string | null): FloatingPlacement | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const candidate = parsed as Partial<FloatingPlacement>;

    if (!isFloatingEdge(candidate.edge) || !isPlayerViewMode(candidate.mode)) {
      return null;
    }

    return {
      edge: candidate.edge,
      offsetRatio: clampRatio(Number(candidate.offsetRatio)),
      mode: candidate.mode,
    };
  } catch {
    return null;
  }
}

function readStoredPlacement(): FloatingPlacement {
  if (typeof window === 'undefined') {
    return DEFAULT_FLOATING_PLACEMENT;
  }

  try {
    return parseStoredPlacement(window.localStorage.getItem(MUSIC_PLAYER_PLACEMENT_STORAGE_KEY)) ?? DEFAULT_FLOATING_PLACEMENT;
  } catch {
    return DEFAULT_FLOATING_PLACEMENT;
  }
}

function storePlacement(placement: FloatingPlacement): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(MUSIC_PLAYER_PLACEMENT_STORAGE_KEY, JSON.stringify(placement));
  } catch {
    // 存储不可用时丢失位置记忆
  }
}

type DragSession = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

export type UseFloatingPositionOptions = {
  draggable: boolean;
  isReadyToPosition: boolean;
  rememberPlacement: boolean;
  /** 偏好层读完存储之前不定位 */
  isPreferenceReady: boolean;
};

export type UseFloatingPositionResult = {
  elementRef: React.RefObject<HTMLDivElement | null>;
  placement: FloatingPlacement;
  geometry: FloatingGeometry | null;
  isDragging: boolean;
  isPositionReady: boolean;
  setMode: (mode: PlayerViewMode) => void;
  dragHandlers: {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
    onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void;
  };
};

export function useFloatingPosition(options: UseFloatingPositionOptions): UseFloatingPositionResult {
  const { draggable, isReadyToPosition, rememberPlacement, isPreferenceReady } = options;

  const elementRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingGeometryRef = useRef<FloatingGeometry | null>(null);
  const suppressClickRef = useRef(false);
  const rememberedRef = useRef<boolean | null>(null);

  const [placement, setPlacement] = useState<FloatingPlacement>(DEFAULT_FLOATING_PLACEMENT);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<ElementSize>({ width: 0, height: 0 });
  const [navbarOffset, setNavbarOffset] = useState(64);
  const [dragGeometry, setDragGeometry] = useState<FloatingGeometry | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // "记住位置"决定用存储值还是默认值；开关就绪后才读
  useEffect(() => {
    if (!isPreferenceReady) return;

    setPlacement(rememberPlacement ? readStoredPlacement() : DEFAULT_FLOATING_PLACEMENT);
    setIsHydrated(true);
  }, [isPreferenceReady]);

  useEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--navbar-height');
    const parsed = Number.parseFloat(raw);

    if (Number.isFinite(parsed) && parsed > 0) {
      setNavbarOffset(parsed);
    }
  }, []);

  const measureElement = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();

    setSize((current) =>
      current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height },
    );
  }, []);

  // 模式切换会立刻改变元素尺寸，必须在同一绘制帧内重新测量并重新定位
  // 每次渲染都测量：元素可能晚于本 effect 首次执行才挂上，measureElement 内部有等值判断
  useLayoutEffect(() => {
    measureElement();
  });

  // ResizeObserver 处理渲染之外的尺寸变化（字体加载、文本重排等）
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => measureElement());

    observer.observe(element);

    return () => observer.disconnect();
  }, [measureElement]);

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });

    update();
    window.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update);

    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  const setMode = useCallback((mode: PlayerViewMode) => {
    setPlacement((current) => (current.mode === mode ? current : { ...current, mode }));
  }, []);

  // 持久化放在 effect 里：状态更新函数在 StrictMode 下会被重复调用
  // 关闭"记住位置"：开关翻转的那一刻回到默认位置，此后不再写入
  useEffect(() => {
    if (!isHydrated) return;

    const wasRemembering = rememberedRef.current;
    rememberedRef.current = rememberPlacement;

    if (!rememberPlacement) {
      if (wasRemembering !== false) {
        setPlacement((current) =>
          current.edge === DEFAULT_FLOATING_PLACEMENT.edge &&
          current.offsetRatio === DEFAULT_FLOATING_PLACEMENT.offsetRatio &&
          current.mode === DEFAULT_FLOATING_PLACEMENT.mode
            ? current
            : DEFAULT_FLOATING_PLACEMENT,
        );
      }

      return;
    }

    storePlacement(placement);
  }, [isHydrated, placement, rememberPlacement]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggable || event.button !== 0) return;
      if (event.target instanceof HTMLElement && event.target.closest('[data-player-interactive]')) return;

      const element = elementRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();

      suppressClickRef.current = false;
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };

      // 不在这里 setPointerCapture：会让子按钮收不到 pointer/click，越过拖动阈值后才接管
    },
    [draggable],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      if (!session.moved) {
        const travelled = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
        if (travelled < dragThresholdPixels) return;
        session.moved = true;
        setIsDragging(true);
        elementRef.current?.setPointerCapture(event.pointerId);
      }

      pendingGeometryRef.current = clampGeometry(
        { left: event.clientX - session.offsetX, top: event.clientY - session.offsetY },
        size,
        viewport,
        navbarOffset,
      );

      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        setDragGeometry(pendingGeometryRef.current);
      });
    },
    [navbarOffset, size, viewport],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      dragRef.current = null;

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      const element = elementRef.current;
      const finalGeometry = pendingGeometryRef.current;

      pendingGeometryRef.current = null;

      if (!session.moved) {
        setDragGeometry(null);
        setIsDragging(false);
        return;
      }

      // 拖动过：吞掉紧随其后的 click，避免松手时误触发按钮
      suppressClickRef.current = true;
      setDragGeometry(null);
      setIsDragging(false);

      if (!element || !finalGeometry) return;

      setPlacement(
        resolveFloatingPlacement(finalGeometry, size, viewport, navbarOffset, placement.mode),
      );
    },
    [navbarOffset, placement.mode, size, viewport],
  );

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;

    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const geometry = isHydrated
    ? dragGeometry ?? resolveFloatingGeometry(placement, size, viewport, navbarOffset)
    : null;

  return {
    elementRef,
    placement,
    geometry: isReadyToPosition ? geometry : null,
    isDragging,
    isPositionReady: isHydrated && size.width > 0 && viewport.width > 0,
    setMode,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClickCapture,
    },
  };
}
