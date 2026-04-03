/**
 * Mirror the checks in @workspace/db resolveDatabaseUrl (keep in sync).
 * Used before importing @workspace/db so the process can stay alive without DATABASE_URL.
 */
export function isPostgresEnvConfigured(): boolean {
  const e = process.env;
  if (e.DATABASE_URL?.trim()) return true;
  if (e.DATABASE_PRIVATE_URL?.trim()) return true;
  if (e.DATABASE_PUBLIC_URL?.trim()) return true;
  if (e.POSTGRES_URL?.trim()) return true;
  if (e.POSTGRES_PRISMA_URL?.trim()) return true;
  const host = e.PGHOST?.trim();
  const user = e.PGUSER?.trim();
  const database = e.PGDATABASE?.trim();
  return Boolean(host && user && database);
}
