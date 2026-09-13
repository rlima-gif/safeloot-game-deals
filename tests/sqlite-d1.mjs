import { DatabaseSync } from 'node:sqlite';
export function sqliteD1(path) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON');
  const db = {
    sqlite,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          return sqlite.prepare(sql).run(...values);
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}
