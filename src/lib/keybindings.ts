import type { KeyBinding, ShortcutAction, Shortcuts } from './types';

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  'toggle',
  'mute',
  'volumeUp',
  'volumeDown',
  'next',
  'previous',
  'mini',
  'show',
];

const key = (k: string, code: string): KeyBinding => ({
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  key: k,
  code,
});

/**
 * Defaults inside the app. System-wide shortcuts start empty: on German and many other
 * layouts Ctrl+Alt is AltGr, so any default would take away characters such as @ or €.
 */
export function defaultShortcuts(): Shortcuts {
  return {
    toggle: { local: key(' ', 'Space'), global: null },
    mute: { local: key('m', 'KeyM'), global: null },
    volumeUp: { local: key('+', 'Equal'), global: null },
    volumeDown: { local: key('-', 'Minus'), global: null },
    next: { local: key('n', 'KeyN'), global: null },
    previous: { local: key('b', 'KeyB'), global: null },
    mini: { local: key('f', 'KeyF'), global: null },
    show: { local: null, global: null },
  };
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock']);

/** Letters, digits and named keys (Space, F5, ArrowUp) respect Shift; symbols do not. */
function shiftMatters(k: string): boolean {
  return k.length > 1 || /^[\p{L}\p{N}]$/u.test(k);
}

/** Comparable form of a key: one case for letters, a name for space. */
export function normalizeKey(k: string): string {
  if (k === ' ' || k === 'Spacebar') return 'Space';
  return k.length === 1 ? k.toUpperCase() : k;
}

/** The binding for a key press, or null while only modifiers are held. */
export function bindingFromEvent(e: KeyboardEvent): KeyBinding | null {
  if (MODIFIER_KEYS.has(e.key) || e.key === 'Dead' || e.key === 'Unidentified') return null;
  return {
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey && shiftMatters(e.key),
    meta: e.metaKey,
    key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
    code: e.code,
  };
}

export function sameBinding(a: KeyBinding, b: KeyBinding, scope: 'local' | 'global'): boolean {
  if (a.ctrl !== b.ctrl || a.alt !== b.alt || a.meta !== b.meta || a.shift !== b.shift)
    return false;
  return scope === 'global' ? a.code === b.code : normalizeKey(a.key) === normalizeKey(b.key);
}

export function matchesEvent(b: KeyBinding, e: KeyboardEvent): boolean {
  const pressed = bindingFromEvent(e);
  return !!pressed && sameBinding(b, pressed, 'local');
}

const hasModifier = (b: KeyBinding) => b.ctrl || b.alt || b.meta;

/** System-wide shortcuts need Ctrl, Alt or Win/Cmd, otherwise normal typing would trigger them. */
export function validGlobal(b: KeyBinding): boolean {
  return hasModifier(b);
}

/** Ctrl+Alt is AltGr on many layouts: worth a warning when recording. */
export function mayCollideWithAltGr(b: KeyBinding): boolean {
  return b.ctrl && b.alt && !b.meta;
}

/** Accelerator string for the global-shortcut plugin, e.g. `Control+Alt+KeyP`. */
export function accelerator(b: KeyBinding): string {
  const parts = [b.ctrl && 'Control', b.alt && 'Alt', b.shift && 'Shift', b.meta && 'Super'];
  return [...parts.filter(Boolean), b.code].join('+');
}

function isTextField(el: Element): boolean {
  if (el.closest('textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  if (el instanceof HTMLInputElement) {
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset'].includes(el.type);
  }
  return false;
}

/** Elements that use these keys themselves (space activates, arrows move). */
function ownsKey(el: Element, k: string): boolean {
  if (k === 'Space' || k === 'Enter') {
    return !!el.closest(
      'button, a[href], summary, input, [role="button"], [role="tab"], [role="checkbox"]',
    );
  }
  if (/^(Arrow|Home$|End$|Page)/.test(k)) {
    return !!el.closest('input, [role="tab"], [role="slider"], [role="listbox"]');
  }
  return false;
}

/** Which action a key press inside the app triggers, if any. */
export function actionFor(e: KeyboardEvent, shortcuts: Shortcuts): ShortcutAction | null {
  // Held keys repeat only for volume.
  if (e.defaultPrevented || (e.repeat && !/^(\+|-|=|_)$/.test(e.key))) return null;
  // Recording a new shortcut: the editor handles keys itself.
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('[data-recording]')) return null;
  const pressed = bindingFromEvent(e);
  if (!pressed) return null;
  if (target && !hasModifier(pressed)) {
    if (isTextField(target) || ownsKey(target, normalizeKey(pressed.key))) return null;
  }
  for (const action of SHORTCUT_ACTIONS) {
    const binding = shortcuts[action].local;
    if (binding && sameBinding(binding, pressed, 'local')) return action;
  }
  return null;
}

/** The other action that already uses this binding in the same scope. */
export function conflictOf(
  shortcuts: Shortcuts,
  action: ShortcutAction,
  scope: 'local' | 'global',
  binding: KeyBinding,
): ShortcutAction | null {
  for (const other of SHORTCUT_ACTIONS) {
    if (other === action) continue;
    const existing = shortcuts[other][scope];
    if (existing && sameBinding(existing, binding, scope)) return other;
  }
  return null;
}

/** Sets a binding; another action holding the same keys loses them (no double use). */
export function assign(
  shortcuts: Shortcuts,
  action: ShortcutAction,
  scope: 'local' | 'global',
  binding: KeyBinding | null,
): Shortcuts {
  const next = structuredClone(shortcuts) as Shortcuts;
  if (binding) {
    const other = conflictOf(shortcuts, action, scope, binding);
    if (other) next[other][scope] = null;
  }
  next[action][scope] = binding;
  return next;
}

function validBinding(value: unknown): KeyBinding | null {
  const b = value as KeyBinding;
  if (
    !b ||
    typeof b !== 'object' ||
    typeof b.key !== 'string' ||
    typeof b.code !== 'string' ||
    !b.key
  )
    return null;
  return {
    ctrl: !!b.ctrl,
    alt: !!b.alt,
    shift: !!b.shift,
    meta: !!b.meta,
    key: b.key,
    code: b.code,
  };
}

export function restoreShortcuts(raw: unknown): Shortcuts {
  const defaults = defaultShortcuts();
  if (!raw || typeof raw !== 'object') return defaults;
  const value = raw as Record<string, { local?: unknown; global?: unknown }>;
  for (const action of SHORTCUT_ACTIONS) {
    const stored = value[action];
    if (!stored || typeof stored !== 'object') continue;
    if ('local' in stored) defaults[action].local = validBinding(stored.local);
    if ('global' in stored) {
      const global = validBinding(stored.global);
      defaults[action].global = global && validGlobal(global) ? global : null;
    }
  }
  return defaults;
}

const ARROWS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Parts for display, e.g. ["Strg", "Alt", "P"]; `names` supplies localised key names. */
export function bindingParts(
  b: KeyBinding,
  names: { ctrl: string; alt: string; shift: string; meta: string; space: string },
  mac: boolean,
): string[] {
  const parts: string[] = [];
  if (mac) {
    if (b.ctrl) parts.push('⌃');
    if (b.alt) parts.push('⌥');
    if (b.shift) parts.push('⇧');
    if (b.meta) parts.push('⌘');
  } else {
    if (b.ctrl) parts.push(names.ctrl);
    if (b.alt) parts.push(names.alt);
    if (b.shift) parts.push(names.shift);
    if (b.meta) parts.push(names.meta);
  }
  const k = normalizeKey(b.key);
  parts.push(k === 'Space' ? names.space : (ARROWS[k] ?? (k === '-' ? '−' : k)));
  return parts;
}

/** Value for aria-keyshortcuts (W3C key names). */
export function ariaKeys(b: KeyBinding | null): string | undefined {
  if (!b) return undefined;
  const parts = [b.ctrl && 'Control', b.alt && 'Alt', b.shift && 'Shift', b.meta && 'Meta'].filter(
    Boolean,
  );
  const k = normalizeKey(b.key);
  parts.push(k === '+' ? 'Plus' : k === '-' ? 'Minus' : k);
  return parts.join('+');
}
