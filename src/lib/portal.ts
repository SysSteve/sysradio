/**
 * Moves an element to the end of <body>, so pop-ups are not clipped or covered by the
 * container they belong to (the player is its own stacking context and clips its content).
 */
export function portal(node: HTMLElement) {
  document.body.append(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
