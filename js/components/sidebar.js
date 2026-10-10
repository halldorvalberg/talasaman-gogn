// The collapsible sidebar. On wide screens it remembers whether it was open;
// on narrow screens it starts closed and closes again after navigating.
// In the Samtal style the sidebar is a top bar instead, and below its own
// (wider) breakpoint the same toggle opens it as a menu under the bar: focus
// moves into the menu, and Escape closes it again.

const narrowFor = {
  minimal: matchMedia('(max-width: 800px)'),
  samtal: matchMedia('(max-width: 1260px)'), // keep in step with css/style-samtal.css
};
const toggle = document.getElementById('toggle-sidebar');

const isSamtal = () => document.documentElement.dataset.style === 'samtal';

/** Whether the sidebar is a drawer (or, in Samtal, a menu) at this width. */
const isNarrow = () => (isSamtal() ? narrowFor.samtal : narrowFor.minimal).matches;

function setOpen(open) {
  document.body.classList.toggle('sidebar-closed', !open);
  toggle.setAttribute('aria-expanded', String(open));
}

/** The state to start in: closed when narrow, else as last left. */
function setInitialState() {
  setOpen(!isNarrow() && localStorage.getItem('sidebar') !== 'closed');
}

/** Samtal's narrow menu: put focus on its first link once it opens. */
function focusMenu() {
  if (isSamtal() && isNarrow()) document.querySelector('#pages a')?.focus();
}

/** Samtal's narrow menu: Escape closes it and returns focus to the toggle. */
function closeMenuOnEscape(e) {
  const open = !document.body.classList.contains('sidebar-closed');
  if (e.key !== 'Escape' || !open || !isSamtal() || !isNarrow()) return;
  setOpen(false);
  toggle.focus();
}

/** Open or close the sidebar to start with, and wire up its toggle. */
export function setupSidebar() {
  setInitialState();
  toggle.addEventListener('click', () => {
    const open = document.body.classList.contains('sidebar-closed');
    setOpen(open);
    if (!isNarrow()) localStorage.setItem('sidebar', open ? 'open' : 'closed');
    else if (open) focusMenu();
  });
  document.addEventListener('keydown', closeMenuOnEscape);
  narrowFor.samtal.addEventListener('change', () => { if (isSamtal()) setInitialState(); });
}

/** After switching style, start over in the new style's state. */
export const followStyle = setInitialState;

/** After choosing a page on a phone, get the sidebar out of the way. */
export function closeSidebarIfNarrow() {
  if (isNarrow()) setOpen(false);
}
