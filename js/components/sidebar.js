// The collapsible sidebar. On wide screens it remembers whether it was open;
// on narrow screens it starts closed and closes again after navigating.

const narrow = matchMedia('(max-width: 800px)');
const toggle = document.getElementById('toggle-sidebar');

function setOpen(open) {
  document.body.classList.toggle('sidebar-closed', !open);
  toggle.setAttribute('aria-expanded', String(open));
}

/** Open or close the sidebar to start with, and wire up its toggle. */
export function setupSidebar() {
  setOpen(!narrow.matches && localStorage.getItem('sidebar') !== 'closed');
  toggle.addEventListener('click', () => {
    const open = document.body.classList.contains('sidebar-closed');
    setOpen(open);
    if (!narrow.matches) localStorage.setItem('sidebar', open ? 'open' : 'closed');
  });
}

/** After choosing a page on a phone, get the sidebar out of the way. */
export function closeSidebarIfNarrow() {
  if (narrow.matches) setOpen(false);
}
