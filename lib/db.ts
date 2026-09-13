// Lazy runtime import lets parsers and database tests run outside Workers.
export interface DatabaseStatement {
  bind(...values: unknown[]): DatabaseStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(sql: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<unknown[]>;
}
export async function database(): Promise<Database> {
  const { env } = await import('cloudflare:workers');
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db)
    throw new Error(
      'Histórico temporariamente indisponível: banco não vinculado.',
    );
  return db;
}
