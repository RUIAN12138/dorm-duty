import { DatabaseSync } from "node:sqlite";

// SQLite-backed D1 contract shim. This script never touches the deployed D1 DB.
// API references: https://developers.cloudflare.com/d1/worker-api/prepared-statements/
// and https://nodejs.org/api/sqlite.html#statementsetreturnarraysenabled
export class SQLiteD1 {
  constructor(filename = ":memory:") {
    this.sqlite = new DatabaseSync(filename);
    this.sqlite.exec("PRAGMA foreign_keys = ON");
  }
  prepare(sql) {
    return new SQLiteStatement(this, sql);
  }
  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
  async batch(statements) {
    // Execute without yielding between statements: D1 batches are atomic.
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.result());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.sqlite.close();
  }
}

class SQLiteStatement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new SQLiteStatement(this.db, this.sql, params);
  }
  statement() {
    return this.db.sqlite.prepare(this.sql);
  }
  returnsRows(statement) {
    if (typeof statement.columns === "function")
      return statement.columns().length > 0;
    return /^\s*(?:SELECT|PRAGMA|EXPLAIN|VALUES|WITH)\b/i.test(this.sql) ||
      /\bRETURNING\b/i.test(this.sql);
  }
  result() {
    const statement = this.statement();
    let results = [];
    let changes = 0;
    let lastRowId = 0;
    if (this.returnsRows(statement)) {
      results = statement.all(...this.params).map((row) => ({ ...row }));
      if (!/^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(this.sql)) {
        const meta = this.db.sqlite
          .prepare(
            "SELECT changes() AS changes, last_insert_rowid() AS last_row_id",
          )
          .get();
        changes = Number(meta.changes);
        lastRowId = Number(meta.last_row_id);
      }
    } else {
      const result = statement.run(...this.params);
      changes = Number(result.changes);
      lastRowId = Number(result.lastInsertRowid);
    }
    return {
      success: true,
      results,
      meta: {
        changes,
        last_row_id: lastRowId,
        duration: 0,
        rows_read: results.length,
        rows_written: changes,
      },
    };
  }
  async all() {
    return this.result();
  }
  async run() {
    return this.result();
  }
  async first(column) {
    const row = this.statement().get(...this.params);
    if (!row) return null;
    if (column !== undefined) {
      if (!Object.hasOwn(row, column))
        throw new Error(`Unknown result column ${column}`);
      return row[column];
    }
    return { ...row };
  }
  async raw({ columnNames = false } = {}) {
    const statement = this.statement();
    if (
      typeof statement.columns === "function" &&
      typeof statement.setReturnArrays === "function"
    ) {
      const names = statement.columns().map((column) => column.name);
      statement.setReturnArrays(true);
      const values = statement.all(...this.params);
      return columnNames ? [names, ...values] : values;
    }
    const rows = statement.all(...this.params).map((row) => ({ ...row }));
    const names = Object.keys(rows[0] || {});
    const values = rows.map((row) => names.map((name) => row[name]));
    return columnNames ? [names, ...values] : values;
  }
}
