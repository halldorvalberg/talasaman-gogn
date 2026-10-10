// The ☀/☾ theme toggle. index.html sets data-theme before first paint; this
// follows the browser until the user picks a theme, then remembers the pick.

const prefersDark = matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme, buttons) {
  document.documentElement.dataset.theme = theme;
  for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.themeChoice === theme));
}

export function setupThemeToggle() {
  const buttons = document.querySelectorAll('[data-theme-choice]');
  applyTheme(document.documentElement.dataset.theme, buttons);

  for (const b of buttons) {
    b.addEventListener('click', () => {
      localStorage.setItem('theme', b.dataset.themeChoice);
      applyTheme(b.dataset.themeChoice, buttons);
    });
  }
  prefersDark.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) applyTheme(e.matches ? 'dark' : 'light', buttons);
  });
}
