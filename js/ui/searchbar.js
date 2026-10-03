// The search box. Emits the normalized text after typing pauses, or at once on Enter.
const input = document.getElementById('search');
const DEBOUNCE_MS = 200;

let timer = 0;
let last = '';

export function mount({ placeholder, onSearch, onArrowDown }) {
  input.placeholder = placeholder;

  const emit = () => {
    clearTimeout(timer);
    const text = input.value.trim().replace(/\s+/g, ' ');
    if (text === last) return; // e.g. only whitespace changed
    last = text;
    onSearch(text);
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(emit, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      emit();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onArrowDown();
    }
  });
}

export function focus() {
  input.focus();
}
