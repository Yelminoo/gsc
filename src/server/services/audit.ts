import { auditLog } from "@/server/db/schema";
import type { DB } from "@/server/db/types";

export async function audit(
  db: DB,
  entry: { userId?: string | null; action: string; entity: string; entityId?: string; detail?: Record<string, unknown> },
) {
  await db.insert(auditLog).values({
    userId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    detail: entry.detail,
  });
}
