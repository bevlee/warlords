/**
 * Marks a height-capped card while content remains below the fold.
 *
 * macOS overlay scrollbars take no width and stay invisible until something
 * scrolls, so a clipped ability list reads as broken text rather than as
 * something to scroll. The attribute drives a bottom fade (see `.card-scroll`
 * in app.css) that clears once the reader reaches the end.
 */
export function scrollCap(node: HTMLElement) {
  const update = () => {
    const more = node.scrollHeight - node.clientHeight - node.scrollTop > 4;
    node.toggleAttribute('data-more', more);
  };

  update();
  node.addEventListener('scroll', update, { passive: true });

  // The container's own box rarely changes; its content does — a taller unit
  // card, a newly taught skill — so watch both.
  const observer = new ResizeObserver(update);
  observer.observe(node);
  if (node.firstElementChild) observer.observe(node.firstElementChild);

  return {
    destroy() {
      node.removeEventListener('scroll', update);
      observer.disconnect();
    },
  };
}
