import path from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), "../../.env") });
config();

export function getDbProvider(): "sqlite" | "postgres" {
  const provider = process.env.DB_PROVIDER?.trim().toLowerCase();
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (provider === "postgres" || url.startsWith("postgresql")) return "postgres";
  return "sqlite";
}

function isMemorySqlite(value: string): boolean {
  return value === ":memory:" || value === "file::memory:" || value.startsWith("file::memory:");
}

export function resolveSqlitePath(): string {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl && isMemorySqlite(dbUrl)) return ":memory:";
  if (dbUrl?.startsWith("file:")) {
    const relative = dbUrl.slice(5);
    const resolved = path.isAbsolute(relative)
      ? relative
      : path.resolve(process.cwd(), relative);
    mkdirSync(path.dirname(resolved), { recursive: true });
    return resolved;
  }
  const configured = process.env.SQLITE_PATH?.trim();
  if (configured === ":memory:") return ":memory:";
  if (configured) {
    mkdirSync(path.dirname(configured), { recursive: true });
    return configured;
  }
  const defaultPath = path.resolve(process.cwd(), "data", "bpmn.db");
  mkdirSync(path.dirname(defaultPath), { recursive: true });
  return defaultPath;
}
