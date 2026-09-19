import React from 'react';

// Click-and-drag horizontal scrolling for a row that only scrolls via touch
// swipe otherwise. "Slide" is what a mouse user actually tries on a pill row
// like this - not spinning the wheel over it - so this mirrors a touch swipe
// with the mouse: press, drag sideways, the row follows the cursor.
//
// The row is full of clickable buttons (sport filter pills), so a plain
// mousedown/mousemove/mouseup would fire a button's onClick after every
// drag too. DRAG_THRESHOLD_PX guards against that: only once the pointer has
// moved past a few pixels do we treat the gesture as a drag and swallow the
// click that would otherwise follow it.
const DRAG_THRESHOLD_PX = 6;

export function useDragScroll() {
  const ref = React.useRef(null);
  const state = React.useRef({ dragging: false, startX: 0, startScrollLeft: 0, moved: false });
  const [metrics, setMetrics] = React.useState({ thumbWidthPct: 100, thumbLeftPct: 0, scrollable: false });

  const updateMetrics = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const scrollable = scrollWidth > clientWidth + 1;
    const thumbWidthPct = scrollable ? Math.max((clientWidth / scrollWidth) * 100, 8) : 100;
    const maxScroll = scrollWidth - clientWidth;
    const thumbLeftPct = scrollable && maxScroll > 0
      ? (scrollLeft / maxScroll) * (100 - thumbWidthPct)
      : 0;
    setMetrics({ thumbWidthPct, thumbLeftPct, scrollable });
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateMetrics();
    el.addEventListener('scroll', updateMetrics, { passive: true });
    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateMetrics);
      resizeObserver.disconnect();
    };
  }, [updateMetrics]);

  const onMouseDown = (e) => {
    const el = ref.current;
    if (!el) return;
    state.current = { dragging: true, startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false };
  };

  const onMouseMove = (e) => {
    const el = ref.current;
    const s = state.current;
    if (!el || !s.dragging) return;
    const delta = e.clientX - s.startX;
    if (Math.abs(delta) > DRAG_THRESHOLD_PX) s.moved = true;
    el.scrollLeft = s.startScrollLeft - delta;
  };

  const endDrag = () => {
    state.current.dragging = false;
  };

  // Capture-phase click swallow: fires before the pill button's own onClick,
  // so a drag that ended on top of a button doesn't also select that sport.
  const onClickCapture = (e) => {
    if (state.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
    state.current.moved = false;
  };

  const onWheel = (e) => {
    const el = ref.current;
    if (el && e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  return {
    ref,
    metrics,
    dragHandlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp: endDrag,
      onMouseLeave: endDrag,
      onClickCapture,
      onWheel,
    },
  };
}

// Small visual scrollbar-style bar to sit under a useDragScroll row, so the
// drag-to-scroll interaction is discoverable instead of hidden. Dragging the
// thumb itself scrubs the row's scrollLeft directly.
export function DragScrollBar({ drag, className = '' }) {
  const barState = React.useRef({ dragging: false, startX: 0, startScrollLeft: 0 });
  const { thumbWidthPct, thumbLeftPct, scrollable } = drag.metrics;

  if (!scrollable) return null;

  const onThumbMouseDown = (e) => {
    const el = drag.ref.current;
    if (!el) return;
    e.stopPropagation();
    barState.current = { dragging: true, startX: e.clientX, startScrollLeft: el.scrollLeft };
    const onMove = (ev) => {
      const s = barState.current;
      if (!s.dragging) return;
      const trackWidth = el.clientWidth;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const scale = maxScroll / (trackWidth * (1 - thumbWidthPct / 100 || 1));
      el.scrollLeft = s.startScrollLeft + (ev.clientX - s.startX) * scale;
    };
    const onUp = () => {
      barState.current.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className={`relative h-1.5 rounded-full bg-[#1a2130] ${className}`}>
      <div
        className="absolute top-0 h-1.5 rounded-full bg-[#b89c5b]/60 hover:bg-[#b89c5b] cursor-grab active:cursor-grabbing transition-colors"
        style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
        onMouseDown={onThumbMouseDown}
      />
    </div>
  );
}
