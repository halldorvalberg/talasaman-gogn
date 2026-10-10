// The sidebar's segmented toggles: the ☀/☾ theme and the Minimal | Samtal
// style. index.html sets data-theme and data-style on <html> before first
// paint; these remember a pick in localStorage under the same name. The theme
// follows the browser until the user picks one; the style defaults to Minimal.

const prefersDark = matchMedia('(prefers-color-scheme: dark)');

/** Set `name` (theme or style) on <html> and mark its pressed button. */
function applyChoice(name, value, buttons) {
  document.documentElement.dataset[name] = value;
  for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset[`${name}Choice`] === value));
}

/**
 * Wire up the buttons marked data-<name>-choice: show the current value and
 * remember a click. Returns the buttons so callers can re-apply a value.
 * @param {'theme'|'style'} name
 * @param {(value: string) => void} [onChange] called after a click applies
 */
function setupChoice(name, onChange) {
  const buttons = document.querySelectorAll(`[data-${name}-choice]`);
  applyChoice(name, document.documentElement.dataset[name], buttons);
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const value = b.dataset[`${name}Choice`];
      localStorage.setItem(name, value);
      applyChoice(name, value, buttons);
      onChange?.(value);
    });
  }
  return buttons;
}

/** Wire up the theme buttons in the sidebar. */
export function setupThemeToggle() {
  const buttons = setupChoice('theme');
  prefersDark.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) applyChoice('theme', e.matches ? 'dark' : 'light', buttons);
  });
}

/** Wire up the Minimal | Samtal style buttons; `onChange` hears a new style. */
export function setupStyleToggle(onChange) {
  setupChoice('style', onChange);
}
