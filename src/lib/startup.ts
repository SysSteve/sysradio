/**
 * Start-up safety net: if the UI cannot start, show what went wrong instead of an empty
 * window, report it to the Rust side (log file / console) and make the window visible.
 */
export function reportError(error: unknown) {
  const text =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : String(error);
  console.error(text);
  if ('__TAURI_INTERNALS__' in window) {
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('frontend_error', { message: text.slice(0, 4000) }).catch(() => {}),
    );
  }
  return text;
}

export function showStartupError(error: unknown) {
  const text = reportError(error);
  const german = navigator.language.toLowerCase().startsWith('de');
  const main = document.createElement('main');
  main.className = 'startup-error';
  const title = document.createElement('h1');
  title.textContent = german ? 'SysRadio konnte nicht starten' : 'SysRadio could not start';
  const hint = document.createElement('p');
  hint.textContent = german
    ? 'Bitte schick diesen Text an den Entwickler (Issue auf GitHub):'
    : 'Please send this text to the developer (an issue on GitHub):';
  const details = document.createElement('pre');
  details.textContent = text;
  details.tabIndex = 0;
  main.append(title, hint, details);
  document.getElementById('app')?.replaceChildren(main);
  if ('__TAURI_INTERNALS__' in window) {
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('show_ui', { mini: false }).catch(() => {}),
    );
  }
}

/** Errors after start (outside the start-up path) are reported, not shown. */
export function watchErrors() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
