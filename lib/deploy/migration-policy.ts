export type MigrationPhase = "EXPAND" | "CONTRACT";
export type MigrationClass = "EXPAND" | "CONTRACT" | "INVALID";

export interface MigrationPolicyResult {
  ok: boolean;
  phase: MigrationPhase;
  reason?: string;
}

const stripComments = (sql: string) => sql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");

const destructive = /\b(?:DROP\s+(?:DATABASE|SCHEMA|TABLE|TYPE|INDEX|VIEW|SEQUENCE)|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE\b[^;]*\bDROP\s+(?:COLUMN|CONSTRAINT)|ALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b[^;]*\bTYPE)\b/i;
const additive = /\b(?:CREATE\s+(?:TABLE|INDEX|TYPE|SEQUENCE|VIEW)|ALTER\s+TABLE\b[^;]*\bADD\s+(?:COLUMN|CONSTRAINT)|CREATE\s+EXTENSION)\b/i;

export function classifyMigration(sql: string): MigrationClass {
  const marker = sql.match(/^\s*--\s*phase:\s*(expand|contract)\s*$/im)?.[1]?.toUpperCase() as MigrationPhase | undefined;
  const body = stripComments(sql);
  if (destructive.test(body)) return marker === "CONTRACT" ? "CONTRACT" : "INVALID";
  if (marker === "CONTRACT") return "CONTRACT";
  if (marker === "EXPAND" || additive.test(body)) return "EXPAND";
  return "INVALID";
}

export function validateMigrationSql(sql: string, requestedPhase: MigrationPhase): MigrationPolicyResult {
  const phase = classifyMigration(sql);
  if (phase === "INVALID") return { ok: false, phase: requestedPhase, reason: "ambiguous migration" };
  if (phase !== requestedPhase) return { ok: false, phase: requestedPhase, reason: `migration classified as ${phase}` };
  const body = stripComments(sql);
  if (requestedPhase === "EXPAND" && destructive.test(body)) {
    return { ok: false, phase: requestedPhase, reason: "expand migration contains destructive SQL" };
  }
  if (requestedPhase === "CONTRACT" && !/^\s*--\s*phase:\s*contract\s*$/im.test(sql)) {
    return { ok: false, phase: requestedPhase, reason: "contract migration requires an explicit phase marker" };
  }
  if (requestedPhase === "CONTRACT" && /\bDROP\s+DATABASE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(body)) {
    return { ok: false, phase: requestedPhase, reason: "contract migration contains unsafe data/destructive SQL" };
  }
  return { ok: true, phase: requestedPhase };
}
