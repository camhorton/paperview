// Wiring and app state. The only module that imports other modules (besides config.js).
import config from './config.js';
import * as storage from './storage/fsaccess.js';
import * as index from './index/sqlite.js';
import * as viewer from './viewer/native.js';
import * as docPanel from './panel/doc-panel.js';
import * as screens from './ui/screens.js';
import * as searchbar from './ui/searchbar.js';
import * as results from './ui/results.js';
import * as pager from './ui/pager.js';
import * as folderMenu from './ui/folder-menu.js';
import * as viewerMessage from './ui/viewer-message.js';
import * as notice from './ui/notice.js';

const APP = config.labels.appTitle;
const SUBFOLDER_HINT = 'Pick a dedicated subfolder, such as Documents\\Paperview. Chrome and Edge won’t open the top level of Documents, Desktop, Downloads, or a drive.';
const EMPTY_VIEWER = { title: 'Select a document to view.' };

const state = {
  ready: false,      // main UI is showing with data loaded
  text: '',          // current search text
  page: 1,           // current results page, 1-based
  selected: null,    // row last chosen in the list
  open: null,        // { file, blob } of the PDF in the viewer
  openSeq: 0,        // bumped per selection so a slow read can't replace a newer one
  dbStamp: null,     // { lastModified, size } of the loaded database file
  refreshing: false,
  refreshError: '',  // last refresh failure, so repeated focus events don't repeat it
};

start();

async function start() {
  document.title = APP;
  searchbar.mount({ placeholder: config.labels.searchPlaceholder, onSearch: search, onArrowDown: results.focusFirst });
  results.mount({ onSelect: openRow });
  pager.mount({ onPage: page => { state.page = page; runSearch(); } });
  folderMenu.mount({ onRefresh: () => refresh(true), onChoose: chooseFolder });
  window.addEventListener('focus', () => refresh(false));
  try {
    await route(await storage.init());
  } catch (err) {
    showScreen({ title: `${APP} couldn’t start`, body: err.message });
  }
}

// --- Folder connection ---------------------------------------------------------------

async function route(result) {
  switch (result.status) {
    case 'unsupported':
      return showScreen({
        title: 'This browser isn’t supported',
        body: `${APP} needs Chrome or Edge on Windows, and the page must be opened from https:// or http://localhost.`,
      });
    case 'none': return showFirstRun();
    case 'prompt': return showReconnect(result.name);
    case 'gone': return showGone(result.name);
    case 'incomplete': return showIncomplete(result);
    case 'ready': return loadData();
    // 'cancelled': nothing to do
  }
}

function showScreen(options) {
  state.ready = false;
  screens.show(options);
}

function showFirstRun(error = '') {
  showScreen({
    title: APP,
    body: `Select the folder that contains ${config.dbFile} and the ${config.scansDir} folder.`,
    error,
    actions: [{ label: 'Select Paperview folder', primary: true, onClick: chooseFolder }],
    note: SUBFOLDER_HINT,
  });
}

function showReconnect(name, error = '') {
  showScreen({
    title: `${APP} needs permission to open “${name}” again`,
    error,
    actions: [
      { label: 'Reconnect folder', primary: true, onClick: reconnect },
      { label: 'Choose a different folder', onClick: chooseFolder },
    ],
    note: `If the browser offers “Allow on every visit”, choose it and ${APP} will reconnect on its own next time.`,
  });
}

function showGone(name) {
  showScreen({
    title: `“${name}” can’t be found`,
    body: 'The folder may have been moved, renamed, or deleted. Choose it in its new location.',
    actions: [{ label: 'Choose a different folder', primary: true, onClick: chooseFolder }],
  });
}

function showIncomplete(result) {
  showScreen({
    title: 'This folder can’t be used',
    body: `${missingText(result)} Choose the folder that holds ${config.dbFile} and the ${config.scansDir} folder.`,
    actions: [{ label: 'Choose a different folder', primary: true, onClick: chooseFolder }],
  });
}

function missingText({ name, missing }) {
  const items = missing.map(item => (item === config.scansDir ? `a ${item} folder` : item));
  return `“${name}” doesn’t contain ${items.join(' or ')}.`;
}

async function chooseFolder() {
  let result;
  try {
    result = await storage.connect();
  } catch {
    // Chrome and Edge refuse some folders outright; any non-cancel failure gets the same advice.
    const message = 'That folder couldn’t be opened.';
    return state.ready ? notice.show(`${message} ${SUBFOLDER_HINT}`) : showFirstRun(message);
  }
  if (result.status === 'incomplete' && state.ready) {
    return notice.show(`${missingText(result)} Still using “${storage.folderName()}”.`);
  }
  await route(result);
}

async function reconnect() {
  const result = await storage.reconnect();
  if (result.status === 'prompt') showReconnect(result.name, 'Permission wasn’t granted.');
  else await route(result);
}

// Re-grants lapsed permission while the main UI is up. Must run first in a click handler.
async function regrant() {
  const result = await storage.reconnect();
  if (result.status === 'ready') return true;
  if (result.status === 'prompt') notice.show(`${APP} still needs permission to read “${result.name}”.`);
  else if (result.status === 'incomplete') notice.show(missingText(result));
  else await route(result);
  return false;
}

// --- Data ----------------------------------------------------------------------------

async function loadData() {
  showScreen({ title: `Opening “${storage.folderName()}”`, body: 'Loading data…' });
  try {
    const { bytes, stamp } = await readDatabase();
    await index.load(bytes);
    state.dbStamp = stamp;
  } catch (err) {
    return showLoadError(err);
  }
  state.ready = true;
  state.page = 1;
  state.selected = null;
  closeDocument();
  viewerMessage.show(EMPTY_VIEWER);
  folderMenu.setName(storage.folderName());
  screens.hide();
  runSearch();
  searchbar.focus();
}

function showLoadError(err) {
  const name = storage.folderName();
  if (err.name === 'NotAllowedError') return showReconnect(name);
  if (err.name === 'NotFoundError') return showIncomplete({ name, missing: [config.dbFile] });
  showScreen({
    title: `${APP} couldn’t load its data`,
    body: err.message,
    actions: [
      { label: 'Try again', primary: true, onClick: loadData },
      { label: 'Choose a different folder', onClick: chooseFolder },
    ],
  });
}

// The local script replaces the database by renaming over it, so a read can fail mid-swap.
function readDatabase() {
  return retryOnce(async () => {
    const file = await storage.readFile(config.dbFile);
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, stamp: { lastModified: file.lastModified, size: file.size } };
  });
}

async function retryOnce(task) {
  try {
    return await task();
  } catch (err) {
    if (err.name === 'NotAllowedError') throw err; // waiting won't restore permission
    await new Promise(resolve => setTimeout(resolve, 1000));
    return task();
  }
}

// Runs on window focus (manual = false) and from "Refresh data" (manual = true).
// Never touches the viewer.
async function refresh(manual) {
  if (!state.ready || state.refreshing) return;
  state.refreshing = true;
  try {
    // Only a click can re-grant permission, so only the menu item tries.
    if (manual && !(await regrant())) return;
    const latest = await retryOnce(() => storage.lastModified(config.dbFile));
    if (latest.lastModified !== state.dbStamp.lastModified || latest.size !== state.dbStamp.size) {
      const { bytes, stamp } = await readDatabase();
      await index.load(bytes);
      state.dbStamp = stamp;
      runSearch(); // keeps the current page while it's still in range
      notice.show('Data refreshed.');
    } else if (manual) {
      notice.show('Data is up to date.');
    }
    state.refreshError = '';
  } catch (err) {
    const message = `Couldn’t refresh data: ${err.message}`;
    if (manual || message !== state.refreshError) notice.show(message);
    state.refreshError = message;
  } finally {
    state.refreshing = false;
  }
}

// --- Search --------------------------------------------------------------------------

function search(text) {
  state.text = text;
  state.page = 1;
  runSearch();
}

function runSearch() {
  try {
    const found = index.search({ text: state.text, page: state.page, pageSize: config.pageSize });
    state.page = found.page;
    results.render(found.rows, state.selected);
    pager.render({ total: found.total, page: found.page, pages: Math.max(1, Math.ceil(found.total / config.pageSize)) });
  } catch (err) {
    notice.show(`Search failed: ${err.message}`);
  }
}

// --- Viewer --------------------------------------------------------------------------

async function openRow(row) {
  state.selected = row;
  results.select(row);
  const seq = ++state.openSeq;
  if (state.open?.file !== row.file) {
    let blob;
    try {
      blob = await storage.readFile(`${config.scansDir}/${row.file}`);
    } catch (err) {
      if (seq === state.openSeq) showFileProblem(row, err);
      return;
    }
    if (seq !== state.openSeq) return; // a newer selection has taken over
    state.open = { file: row.file, blob };
  }
  viewerMessage.hide();
  viewer.show(state.open.blob, row.page);
  docPanel.render(row);
}

function showFileProblem(row, err) {
  closeDocument();
  if (err.name === 'NotFoundError') {
    viewerMessage.show({ title: 'No files found', detail: row.file });
  } else if (err.name === 'NotAllowedError') {
    viewerMessage.show({
      title: `${APP} needs permission to open “${storage.folderName()}” again`,
      action: { label: 'Reconnect folder', onClick: reconnectViewer },
    });
  } else {
    viewerMessage.show({ title: 'This file couldn’t be opened', detail: `${row.file} (${err.message})` });
  }
}

async function reconnectViewer() {
  if ((await regrant()) && state.selected) await openRow(state.selected);
}

function closeDocument() {
  state.open = null;
  state.openSeq += 1;
  viewer.clear();
  docPanel.clear();
}
