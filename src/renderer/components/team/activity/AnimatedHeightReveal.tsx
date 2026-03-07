import { useCallback, useEffect, useRef, useState } from 'react';

import type { CSSProperties, MutableRefObject, PropsWithChildren, Ref } from 'react';

export const ENTRY_REVEAL_ANIMATION_MS = 700;
export const ENTRY_REVEAL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

interface AnimatedHeightRevealProps extends PropsWithChildren {
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
  containerRef?: Ref<HTMLDivElement>;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  (ref as MutableRefObject<T | null>).current = value;
}

export const AnimatedHeightReveal = ({
  animate,
  className,
  style,
  containerRef,
  children,
}: AnimatedHeightRevealProps): JSX.Element => {
  const shouldAnimateOnMountRef = useRef(Boolean(animate));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const prefersReducedMotionRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(() => !shouldAnimateOnMountRef.current);

  const setWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      assignRef(containerRef, node);
    },
    [containerRef]
  );

  const clearPendingAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    prefersReducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!shouldAnimateOnMountRef.current || prefersReducedMotionRef.current) {
      setIsExpanded(true);
      return;
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = requestAnimationFrame(() => {
        setIsExpanded(true);
        animationFrameRef.current = null;
      });
    });

    return () => {
      clearPendingAnimation();
    };
  }, [clearPendingAnimation]);

  useEffect(
    () => () => {
      clearPendingAnimation();
    },
    [clearPendingAnimation]
  );

  const shouldTransition =
    shouldAnimateOnMountRef.current && !prefersReducedMotionRef.current && isExpanded;

  return (
    <div
      ref={setWrapperRef}
      className={className}
      style={{
        display: 'grid',
        gridTemplateRows: isExpanded ? '1fr' : '0fr',
        opacity: isExpanded ? 1 : 0,
        transition: shouldTransition
          ? [
              `grid-template-rows ${ENTRY_REVEAL_ANIMATION_MS}ms ${ENTRY_REVEAL_EASING}`,
              `opacity ${ENTRY_REVEAL_ANIMATION_MS}ms ease`,
            ].join(', ')
          : undefined,
        ...style,
      }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  );
};
