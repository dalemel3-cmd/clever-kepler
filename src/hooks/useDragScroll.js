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
