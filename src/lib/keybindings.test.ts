import { describe, expect, it } from 'vitest';
import {
  accelerator,
  actionFor,
  assign,
  bindingFromEvent,
  bindingParts,
  defaultShortcuts,
  mayCollideWithAltGr,
  restoreShortcuts,
  validGlobal,
} from './keybindings';
import type { KeyBinding } from './types';

function press(key: string, target: Element, init: KeyboardEventInit = {}) {
  let action: ReturnType<typeof actionFor> = null;
  const shortcuts =
    (init as { shortcuts?: ReturnType<typeof defaultShortcuts> }).shortcuts ?? defaultShortcuts();
  target.addEventListener('keydown', (e) => (action = actionFor(e as KeyboardEvent, shortcuts)), {
    once: true,
  });
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  return action;
}

const b = (key: string, code: string, mods: Partial<KeyBinding> = {}): KeyBinding => ({
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  key,
  code,
  ...mods,
});

describe('shortcuts inside the app', () => {
  const button = document.body.appendChild(document.createElement('button'));
  const search = document.body.appendChild(
    Object.assign(document.createElement('input'), { type: 'search' }),
  );
  const range = document.body.appendChild(
    Object.assign(document.createElement('input'), { type: 'range' }),
  );
  const main = document.body.appendChild(document.createElement('main'));

  it('work while a button or the slider has focus', () => {
    expect(press('+', button)).toBe('volumeUp');
    expect(press('-', button)).toBe('volumeDown');
    expect(press('m', range)).toBe('mute');
    expect(press('M', button, { shiftKey: true })).toBeNull();
    expect(press('n', button)).toBe('next');
  });

  it('+ matches with or without Shift (US and German layouts)', () => {
    expect(press('+', main, { shiftKey: true })).toBe('volumeUp');
  });

  it('space toggles only where it does not activate an element', () => {
    expect(press(' ', main)).toBe('toggle');
    expect(press(' ', button)).toBeNull();
  });

  it('never in text fields, unless the shortcut has a modifier', () => {
    expect(press('m', search)).toBeNull();
    const custom = assign(defaultShortcuts(), 'mute', 'local', b('m', 'KeyM', { ctrl: true }));
    expect(press('m', search, { ctrlKey: true, shortcuts: custom } as KeyboardEventInit)).toBe(
      'mute',
    );
  });
});

describe('editing shortcuts', () => {
  it('records presses, ignoring lone modifiers', () => {
    expect(
      bindingFromEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true })),
    ).toBeNull();
    expect(
      bindingFromEvent(
        new KeyboardEvent('keydown', {
          key: 'P',
          code: 'KeyP',
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
        }),
      ),
    ).toEqual(b('p', 'KeyP', { ctrl: true, alt: true, shift: true }));
  });

  it('moves a binding away from the action that had it', () => {
    const next = assign(defaultShortcuts(), 'mini', 'local', b('m', 'KeyM'));
    expect(next.mini.local?.key).toBe('m');
    expect(next.mute.local).toBeNull();
  });

  it('system-wide shortcuts need a modifier and warn about AltGr', () => {
    expect(validGlobal(b('p', 'KeyP'))).toBe(false);
    expect(validGlobal(b('p', 'KeyP', { shift: true }))).toBe(false);
    expect(validGlobal(b('p', 'KeyP', { ctrl: true, shift: true }))).toBe(true);
    expect(mayCollideWithAltGr(b('q', 'KeyQ', { ctrl: true, alt: true }))).toBe(true);
    expect(accelerator(b('p', 'KeyP', { ctrl: true, shift: true }))).toBe('Control+Shift+KeyP');
  });

  it('shows localised names', () => {
    const names = { ctrl: 'Strg', alt: 'Alt', shift: 'Umschalt', meta: 'Win', space: 'Leertaste' };
    expect(bindingParts(b(' ', 'Space'), names, false)).toEqual(['Leertaste']);
    expect(bindingParts(b('ArrowUp', 'ArrowUp', { ctrl: true }), names, false)).toEqual([
      'Strg',
      '↑',
    ]);
    expect(bindingParts(b('ArrowUp', 'ArrowUp', { meta: true }), names, true)).toEqual(['⌘', '↑']);
  });

  it('restores stored shortcuts and drops invalid ones', () => {
    const restored = restoreShortcuts({
      mute: { local: null, global: b('m', 'KeyM') },
      toggle: { global: b('p', 'KeyP', { ctrl: true, shift: true }) },
      next: 'garbage',
    });
    expect(restored.mute.local).toBeNull();
    expect(restored.mute.global).toBeNull();
    expect(restored.toggle.global?.code).toBe('KeyP');
    expect(restored.toggle.local?.code).toBe('Space');
    expect(restored.next).toEqual(defaultShortcuts().next);
  });
});
