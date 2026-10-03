// Full-window status screens (first run, reconnect, errors) shown in place of the main layout.
const screen = document.getElementById('screen');
const app = document.getElementById('app');
const title = document.getElementById('screen-title');
const body = document.getElementById('screen-body');
const error = document.getElementById('screen-error');
const actions = document.getElementById('screen-actions');
const note = document.getElementById('screen-note');

// options: { title, body?, error?, note?, actions?: [{ label, primary?, onClick }] }
export function show(options) {
  document.querySelector('.boot-hint')?.remove();
  setText(title, options.title);
  setText(body, options.body);
  setText(error, options.error);
  setText(note, options.note);
  actions.replaceChildren(...(options.actions ?? []).map(makeButton));
  app.hidden = true;
  screen.hidden = false;
  actions.querySelector('button')?.focus();
}

export function hide() {
  screen.hidden = true;
  app.hidden = false;
}

function setText(element, text) {
  element.textContent = text ?? '';
  element.hidden = !text;
}

function makeButton({ label, primary = false, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = primary ? 'button primary' : 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    setDisabled(true);
    try {
      await onClick();
    } catch (err) {
      setText(error, err.message);
    } finally {
      setDisabled(false);
      // Disabling the focused button drops focus to the page; put it back if it's still shown.
      if (button.isConnected && document.activeElement === document.body) button.focus();
    }
  });
  return button;
}

function setDisabled(disabled) {
  for (const button of actions.querySelectorAll('button')) button.disabled = disabled;
}
