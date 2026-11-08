import type { Request } from "express";
import type { Db, Tx } from "@marea/db";

/** JSON-safe snapshot (Dates → ISO strings, drops secrets). */
function snapshot(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v) => (k === "passwordHash" || k === "tokenHash" ? undefined : v)),
  );
}

export async function audit(
  db: Db | Tx,
  req: Request,
  entry: { action: string; entityType: string; entityId?: string | number | null; before?: unknown; after?: unknown },
) {
  await db.adminAuditLog.create({
    data: {
      actorUserId: req.admin?.user.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      before: snapshot(entry.before) as never,
      after: snapshot(entry.after) as never,
      ipAddress: req.ip?.slice(0, 45) ?? null,
      userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
    },
  });
}
