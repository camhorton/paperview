// Non-blocking messages at the bottom of the window. They hide after a few seconds.
const box = document.getElementById('notice');
const text = document.getElementById('notice-text');
const VISIBLE_MS = 8000;

let timer = 0;

document.getElementById('notice-close').addEventListener('click', hide);

export function show(message) {
  text.textContent = message;
  box.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(hide, VISIBLE_MS);
}

function hide() {
  clearTimeout(timer);
  box.hidden = true;
  text.textContent = '';
}
