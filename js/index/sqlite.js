// Read-only search index over the SQLite database, using sql.js from vendor/sqljs/.
// The only module that knows about sql.js, SQL, or physical table and column names.
import config from '../config.js';

const VENDOR = new URL('../../vendor/sqljs/', import.meta.url);
const FIELDS = ['file', 'page', 'date', 'extra'];
const MAGIC = 'SQLite format 3\0';

let sqlJs = null;   // promise for the initialized sql.js module
let queries = null; // SQL fragments built from config on first load
let db = null;

// Replaces the loaded database with `bytes` (a Uint8Array of the whole file).
// Throws a descriptive Error if the file isn't a usable database; the previous one stays loaded.
export async function load(bytes) {
  const SQL = await loadSqlJs();
  queries ??= buildQueries();
  checkHeader(bytes);
  const next = new SQL.Database(bytes);
  try {
    validate(next);
  } catch (err) {
    next.close();
    throw err;
  }
  db?.close();
  db = next;
}

// Every whitespace-separated term must match at least one search field.
// Returns { rows, total, page }; `page` is clamped to the available range.
export function search({ text, page, pageSize }) {
  const terms = text.trim().split(/\s+/).filter(Boolean);
  const where = terms.length ? ` WHERE ${terms.map(() => queries.match).join(' AND ')}` : '';
  const params = terms.flatMap(term => config.searchFields.map(() => `%${escapeLike(term)}%`));

  const total = scalar(db, `SELECT COUNT(*)${queries.from}${where}`, params);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const rows = all(
    db,
    `${queries.select}${queries.from}${where}${queries.order} LIMIT ? OFFSET ?`,
    [...params, pageSize, (current - 1) * pageSize],
  );
  return { rows: rows.map(toRow), total, page: current };
}

function loadSqlJs() {
  sqlJs ??= (async () => {
    if (typeof window.initSqlJs !== 'function') await addScript(new URL('sql-wasm.js', VENDOR).href);
    if (typeof window.initSqlJs !== 'function') {
      throw new Error('vendor/sqljs/sql-wasm.js loaded but did not define initSqlJs. Use the sql-wasm.js file from sql.js\'s dist/ folder (see README).');
    }
    try {
      return await window.initSqlJs({ locateFile: file => new URL(file, VENDOR).href });
    } catch (err) {
      throw new Error(`Couldn't start sql.js. Check that vendor/sqljs/sql-wasm.wasm is present and matches sql-wasm.js, then reload the page. (${err?.message ?? err})`);
    }
  })();
  sqlJs.catch(() => { sqlJs = null; });
  return sqlJs;
}

function addScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Couldn\'t load vendor/sqljs/sql-wasm.js. Add sql.js as described in the README, then reload the page.'));
    document.head.append(script);
  });
}

function buildQueries() {
  const select = FIELDS.map(field => `${column(field)} AS ${quote(field)}`).join(', ');
  const order = config.sort
    .map(({ field, dir }) => `${column(field)} ${dir === 'desc' ? 'DESC' : 'ASC'}`)
    .join(', ');
  const anyField = config.searchFields.map(field => `${column(field)} LIKE ? ESCAPE '\\'`).join(' OR ');
  return {
    select: `SELECT ${select}`,
    from: ` FROM ${quote(config.table)}`,
    order: order ? ` ORDER BY ${order}` : '',
    match: `(${anyField})`,
  };
}

function column(field) {
  const name = config.columns[field];
  if (!name) throw new Error(`config.js refers to a field "${field}" that has no entry in columns.`);
  return quote(name);
}

function quote(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

// Backslash is the ESCAPE character, so it must be escaped too.
function escapeLike(term) {
  return term.replace(/[\\%_]/g, '\\$&');
}

function checkHeader(bytes) {
  const header = new TextDecoder().decode(bytes.subarray(0, MAGIC.length));
  if (bytes.length < 100 || header !== MAGIC) {
    throw new Error(`${config.dbFile} is not a SQLite database. It may be empty or damaged.`);
  }
  // Header bytes 18 and 19 hold the file format versions; 2 means WAL mode.
  if (bytes[18] === 2 || bytes[19] === 2) {
    throw new Error(`${config.dbFile} is in WAL mode. Paperview needs rollback-journal mode (journal_mode=DELETE); see the data contract in the README.`);
  }
}

function validate(database) {
  let version;
  try {
    version = scalar(database, 'PRAGMA user_version');
  } catch (err) {
    throw new Error(`${config.dbFile} couldn't be read as a SQLite database. (${err.message})`);
  }
  if (version !== config.schemaVersion) {
    throw new Error(`${config.dbFile} has schema version ${version}, but this version of Paperview expects version ${config.schemaVersion}.`);
  }

  const tables = scalar(
    database,
    "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table', 'view') AND name = ? COLLATE NOCASE",
    [config.table],
  );
  if (!tables) throw new Error(`${config.dbFile} has no "${config.table}" table.`);

  const present = new Set(
    all(database, 'SELECT name FROM pragma_table_info(?)', [config.table]).map(r => r.name.toLowerCase()),
  );
  const missing = FIELDS.map(f => config.columns[f]).filter(name => !present.has(name.toLowerCase()));
  if (missing.length) {
    const noun = missing.length === 1 ? 'column' : 'columns';
    throw new Error(`The "${config.table}" table in ${config.dbFile} is missing the ${noun} ${missing.join(', ')}.`);
  }
}

function all(database, sql, params = []) {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

function scalar(database, sql, params) {
  const [row] = all(database, sql, params);
  return row ? Object.values(row)[0] : undefined;
}

function toRow(r) {
  return {
    file: String(r.file ?? ''),
    page: Number(r.page),
    date: r.date == null ? '' : String(r.date),
    extra: r.extra == null ? '' : String(r.extra),
  };
}
