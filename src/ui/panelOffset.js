// Keeps the side panels (info, eclipses, events, sky from Earth) below the toolbar.
// The toolbar wraps onto a second row when its buttons don't fit, so its height varies;
// we publish its bottom edge as --panel-top, which those panels use for their `top`.
// (Narrow screens position panels differently and ignore it.)

export function initPanelOffset() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return;
  const root = document.documentElement;
  const update = () => {
    const bottom = Math.ceil(toolbar.getBoundingClientRect().bottom + 12);
    root.style.setProperty('--panel-top', `${bottom}px`);
  };
  new ResizeObserver(update).observe(toolbar); // button rows added by features, wrapping, font loading…
  window.addEventListener('resize', update);
  update();
}
