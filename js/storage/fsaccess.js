// Folder access through the File System Access API, with the folder handle kept in IndexedDB.
//
// init(), connect() and reconnect() resolve to { status, name?, missing? } where status is:
//   'unsupported'  the browser has no showDirectoryPicker (or the page isn't a secure context)
//   'none'         no folder saved yet
//   'cancelled'    the user closed the picker
//   'prompt'       a saved folder needs a click to re-grant read permission
//   'gone'         the saved folder was moved or deleted
//   'incomplete'   the folder lacks config.dbFile and/or config.scansDir (listed in `missing`)
//   'ready'        the folder is usable
import config from '../config.js';

const IDB_NAME = 'paperview';
const IDB_STORE = 'handles';
const IDB_KEY = 'folder';

let folder = null;

export async function init() {
  if (typeof window.showDirectoryPicker !== 'function') return { status: 'unsupported' };
  folder = (await idb('readonly', store => store.get(IDB_KEY))) ?? null;
  if (!folder) return { status: 'none' };
  if ((await folder.queryPermission({ mode: 'read' })) !== 'granted') {
    return { status: 'prompt', name: folder.name };
  }
  return verify(folder);
}

// Opens the picker. Must be called from a click. Throws on picker failures other than cancelling.
export async function connect() {
  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: 'paperview', mode: 'read', startIn: 'documents' });
  } catch (err) {
    if (err.name === 'AbortError') return { status: 'cancelled' };
    throw err;
  }
  const result = await verify(dir);
  if (result.status === 'ready') {
    folder = dir;
    await idb('readwrite', store => store.put(dir, IDB_KEY));
  }
  return result;
}

// Re-grants read permission for the saved folder. Must be called from a click.
// Resolves at once, without a prompt, when permission is already granted.
export async function reconnect() {
  if (!folder) return { status: 'none' };
  try {
    if ((await folder.requestPermission({ mode: 'read' })) !== 'granted') {
      return { status: 'prompt', name: folder.name };
    }
  } catch (err) {
    if (err.name === 'NotFoundError') return { status: 'gone', name: folder.name };
    throw err;
  }
  return verify(folder);
}

export function folderName() {
  return folder?.name ?? '';
}

// Returns a File for a path relative to the folder, e.g. "Scans/foo.pdf".
// Errors are normalized: name 'NotFoundError' when missing, 'NotAllowedError' when permission lapsed.
export async function readFile(path) {
  try {
    const handle = await getHandle(folder, path, 'file');
    return await handle.getFile();
  } catch (err) {
    throw normalize(err, path);
  }
}

export async function lastModified(path) {
  const file = await readFile(path);
  return { lastModified: file.lastModified, size: file.size };
}

async function verify(dir) {
  try {
    await dir.keys().next(); // rejects with NotFoundError if the folder itself is gone
  } catch (err) {
    if (err.name === 'NotFoundError') return { status: 'gone', name: dir.name };
    throw err;
  }
  const missing = [];
  if (!(await exists(dir, config.dbFile, 'file'))) missing.push(config.dbFile);
  if (!(await exists(dir, config.scansDir, 'directory'))) missing.push(config.scansDir);
  return missing.length
    ? { status: 'incomplete', name: dir.name, missing }
    : { status: 'ready', name: dir.name };
}

async function exists(dir, path, kind) {
  try {
    await getHandle(dir, path, kind);
    return true;
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
}

async function getHandle(dir, path, kind) {
  const parts = path.split('/');
  const last = parts.pop();
  for (const part of parts) dir = await dir.getDirectoryHandle(part);
  return kind === 'file' ? dir.getFileHandle(last) : dir.getDirectoryHandle(last);
}

// TypeMismatchError: a folder where a file was expected. TypeError: an invalid name such as "..".
function isMissing(err) {
  return ['NotFoundError', 'TypeMismatchError', 'TypeError'].includes(err.name);
}

function normalize(err, path) {
  if (isMissing(err)) return new DOMException(`${path} was not found.`, 'NotFoundError');
  if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
    return new DOMException(`Permission to read ${path} has lapsed.`, 'NotAllowedError');
  }
  return err;
}

function idb(mode, run) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(IDB_STORE, mode);
      const op = run(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => { db.close(); resolve(op.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
