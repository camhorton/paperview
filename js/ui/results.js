// The list of page-hits. Each row is a button, so Enter and click both select it;
// ArrowUp and ArrowDown move between rows.
const area = document.getElementById('results-area');
const list = document.getElementById('results');
const empty = document.getElementById('results-empty');
const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

let rows = [];

export function mount({ onSelect }) {
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-index]');
    if (button) onSelect(rows[Number(button.dataset.index)]);
  });
  list.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = [...list.querySelectorAll('button')];
    const next = buttons[buttons.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  });
}

// `selected` is the row shown in the viewer ({ file, page }), or null.
export function render(newRows, selected) {
  const focused = [...list.querySelectorAll('button')].indexOf(document.activeElement);
  rows = newRows;
  list.replaceChildren(...rows.map(makeItem));
  area.scrollTop = 0;
  empty.hidden = rows.length > 0;
  select(selected);
  // Keep keyboard users in the list when it's redrawn under them (paging, data refresh).
  if (focused >= 0) {
    const buttons = list.querySelectorAll('button');
    buttons[Math.min(focused, buttons.length - 1)]?.focus();
  }
}

export function select(target) {
  list.querySelectorAll('button').forEach((button, i) => {
    const row = rows[i];
    if (target && row.file === target.file && row.page === target.page) {
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

export function focusFirst() {
  list.querySelector('button')?.focus();
}

function makeItem(row, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hit';
  button.dataset.index = String(index);

  const file = span('hit-file', row.file);
  file.title = row.file;
  button.append(file, span('hit-page', `Page ${row.page}`), span('hit-date', formatDate(row.date)));

  const item = document.createElement('li');
  item.append(button);
  return item;
}

function span(className, text) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

function formatDate(raw) {
  // A date-only ISO string parses as UTC midnight, which can show as the previous day locally.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = dateOnly ? new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]) : new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : dateFormat.format(date);
}
