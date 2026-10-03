// The folder button and its popover (native Popover API: light dismiss and Escape for free).
const button = document.getElementById('folder-button');
const label = document.getElementById('folder-name');
const menu = document.getElementById('folder-menu');

export function mount({ onRefresh, onChoose }) {
  menu.addEventListener('beforetoggle', event => {
    if (event.newState !== 'open') return;
    // Right-align the menu under the button.
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
  });
  menu.addEventListener('click', event => {
    const action = event.target.closest('button[data-action]')?.dataset.action;
    if (!action) return;
    menu.hidePopover();
    // Still inside the click, so the picker and permission prompt are allowed to open.
    if (action === 'refresh') onRefresh();
    else onChoose();
  });
  window.addEventListener('resize', () => {
    if (menu.matches(':popover-open')) menu.hidePopover();
  });
}

export function setName(name) {
  label.textContent = name;
  button.title = `Folder: ${name}`;
  button.setAttribute('aria-label', `Folder options for ${name}`);
}
