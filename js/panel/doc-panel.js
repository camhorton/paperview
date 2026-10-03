// The bar above the viewer, reserved for actions on the selected document.
// v1 has no actions: render(row) receives the selected row for future use and only resets the bar.
const bar = document.getElementById('doc-bar');

export function render(row) {
  bar.replaceChildren();
}

export function clear() {
  bar.replaceChildren();
}
