// Messages in the viewer area: the empty state, a missing file, a lapsed permission.
const box = document.getElementById('viewer-message');

// options: { title, detail?, action?: { label, onClick } }
export function show({ title, detail = '', action = null }) {
  const parts = [paragraph('viewer-message-title', title)];
  if (detail) parts.push(paragraph('viewer-message-detail', detail));
  if (action) parts.push(makeButton(action));
  box.replaceChildren(...parts);
  box.hidden = false;
}

export function hide() {
  box.hidden = true;
  box.replaceChildren();
}

function paragraph(className, text) {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

function makeButton({ label, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button primary';
  button.textContent = label;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await onClick();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}
