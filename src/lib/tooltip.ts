/**
 * Tooltip action: `use:tooltip={{ text: 'Lautstärke', keys: '+ / −' }}`.
 * Shows on hover (after a short delay) and on keyboard focus. Meets WCAG 1.4.13: Esc closes
 * it, the pointer can move onto it without it vanishing, and it stays until the pointer or
 * focus leaves. It repeats the control's accessible name, so it is hidden from screen
 * readers (shortcuts are announced through `aria-keyshortcuts` on the control).
 */
export interface TooltipOptions {
  text: string;
  keys?: string;
}

const SHOW_DELAY = 450;
const HIDE_DELAY = 120;

export function tooltip(node: HTMLElement, options: TooltipOptions) {
  let current = options;
  let tip: HTMLDivElement | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function render() {
    if (!tip) return;
    tip.replaceChildren(document.createTextNode(current.text));
    if (current.keys) {
      const keys = document.createElement('kbd');
      keys.textContent = current.keys;
      tip.append(keys);
    }
  }

  function place() {
    if (!tip) return;
    const rect = node.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const margin = 6;
    let top = rect.top - tipRect.height - margin;
    if (top < 4) top = rect.bottom + margin;
    const left = Math.min(
      Math.max(4, rect.left + rect.width / 2 - tipRect.width / 2),
      window.innerWidth - tipRect.width - 4,
    );
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  }

  function show() {
    clearTimeout(hideTimer);
    if (tip || !current.text) return;
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.setAttribute('aria-hidden', 'true');
    tip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    tip.addEventListener('pointerleave', scheduleHide);
    render();
    document.body.append(tip);
    place();
    document.addEventListener('keydown', onKey, true);
  }

  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    tip?.remove();
    tip = null;
    document.removeEventListener('keydown', onKey, true);
  }

  function scheduleHide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && tip) {
      hide();
      e.stopPropagation();
    }
  }

  const onEnter = () => {
    clearTimeout(hideTimer);
    showTimer = setTimeout(show, SHOW_DELAY);
  };
  const onFocus = () => {
    if (node.matches(':focus-visible')) show();
  };

  node.addEventListener('pointerenter', onEnter);
  node.addEventListener('pointerleave', scheduleHide);
  node.addEventListener('focus', onFocus);
  node.addEventListener('blur', hide);
  node.addEventListener('pointerdown', hide);

  return {
    update(next: TooltipOptions) {
      current = next;
      render();
      place();
    },
    destroy() {
      hide();
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', scheduleHide);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', hide);
      node.removeEventListener('pointerdown', hide);
    },
  };
}
