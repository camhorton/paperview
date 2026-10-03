export default {
  // Where things are, relative to the folder the user selects
  dbFile: "paperview.db",
  scansDir: "Scans",
  table: "pages",
  schemaVersion: 1,             // must equal PRAGMA user_version

  // Logical field -> physical column. The only place physical names appear.
  columns: { file: "file_name", page: "page_number", date: "uploaded_at", extra: "key_words" },

  // Search and sort use logical field names
  searchFields: ["file", "extra"],
  sort: [
    { field: "date", dir: "desc" },
    { field: "file", dir: "asc" },
    { field: "page", dir: "asc" }
  ],
  pageSize: 30,

  labels: {
    appTitle: "Paperview",      // browser tab title
    searchPlaceholder: "Search for PO number or file name...",   // e.g. "Search PO number or file name…"
    extra: "Keywords"           // reserved: not shown in v1 results
  }
};
