// client/src/components/StickyHorizontalScroll.jsx
//
// Wraps a horizontally-scrollable child (typically a wide table) and adds a
// second, "sticky" horizontal scrollbar at the top of the wrapper that stays
// visible as the user scrolls the page. Both scrollbars stay in sync.
//
// Usage:
//   <StickyHorizontalScroll>
//     <table>...</table>
//   </StickyHorizontalScroll>

import { useEffect, useRef, useState } from 'react';

export default function StickyHorizontalScroll({ children, className = '', topOffset = 0 }) {
  const bottomRef = useRef(null);
  const topRef    = useRef(null);
  const innerRef  = useRef(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [needsScroll, setNeedsScroll] = useState(false);

  // Keep the fake inner div width in sync with the real content width.
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const measure = () => {
      const sw = el.scrollWidth;
      const cw = el.clientWidth;
      setScrollWidth(sw);
      setNeedsScroll(sw > cw + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Also observe direct children changes for tables that grow.
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [children]);

  const syncing = useRef(false);
  const onScrollTop = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (bottomRef.current && topRef.current) {
      bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    }
    requestAnimationFrame(() => { syncing.current = false; });
  };
  const onScrollBottom = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (bottomRef.current && topRef.current) {
      topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    }
    requestAnimationFrame(() => { syncing.current = false; });
  };

  return (
    <div className={className}>
      {needsScroll && (
        <div
          ref={topRef}
          onScroll={onScrollTop}
          className="sticky z-20 overflow-x-auto overflow-y-hidden bg-background/95 backdrop-blur-sm border-b border-rekker-border"
          style={{ top: topOffset, height: 14 }}
        >
          <div ref={innerRef} style={{ width: scrollWidth, height: 1 }} />
        </div>
      )}
      <div ref={bottomRef} onScroll={onScrollBottom} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
