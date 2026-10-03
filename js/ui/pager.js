// Result count and Prev / "Page X of Y" / Next. Buttons use aria-disabled rather than
// disabled so keyboard focus stays on them at the first and last page.
const count = document.getElementById('result-count');
const label = document.getElementById('page-label');
const prev = document.getElementById('page-prev');
const next = document.getElementById('page-next');
const number = new Intl.NumberFormat();

let page = 1;
let pages = 1;

export function mount({ onPage }) {
  prev.addEventListener('click', () => { if (page > 1) onPage(page - 1); });
  next.addEventListener('click', () => { if (page < pages) onPage(page + 1); });
}

export function render(state) {
  ({ page, pages } = state);
  count.textContent = `${number.format(state.total)} ${state.total === 1 ? 'result' : 'results'}`;
  label.textContent = `Page ${number.format(page)} of ${number.format(pages)}`;
  prev.setAttribute('aria-disabled', String(page <= 1));
  next.setAttribute('aria-disabled', String(page >= pages));
}
