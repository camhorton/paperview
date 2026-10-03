// Shows a PDF page with the browser's built-in viewer in an iframe.
// The only module that knows about iframes and blob URLs. To switch to PDF.js, replace this
// file with one that exports the same show(blob, page) and clear().
const host = document.getElementById('viewer-frame');

let current = null; // { blob, url } for the file in the viewer

export function show(blob, page) {
  if (navigator.pdfViewerEnabled === false) {
    // Setting the iframe's src would download the file instead of showing it.
    clear();
    host.append(paragraph('viewer-note', 'This browser is set to download PDFs instead of showing them. Turn on its built-in PDF viewer (see the README), then reload this page.'));
    return;
  }
  if (blob !== current?.blob) {
    clear();
    // Slicing a File keeps the bytes on disk while giving the viewer the right MIME type.
    current = { blob, url: URL.createObjectURL(blob.slice(0, blob.size, 'application/pdf')) };
  }
  const pageNumber = Number.isInteger(page) && page > 0 ? page : 1;

  // A new iframe per selection: changing only the #page fragment doesn't reliably move the
  // native viewer. The loading text sits underneath and is covered once the viewer paints.
  const loading = paragraph('viewer-loading', 'Opening file…');
  const frame = document.createElement('iframe');
  frame.className = 'viewer-iframe';
  frame.title = blob.name || 'PDF document';
  frame.addEventListener('load', () => loading.remove(), { once: true });
  frame.src = `${current.url}#page=${pageNumber}`;
  host.replaceChildren(loading, frame);
}

export function clear() {
  host.replaceChildren();
  if (current) URL.revokeObjectURL(current.url);
  current = null;
}

function paragraph(className, text) {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}
