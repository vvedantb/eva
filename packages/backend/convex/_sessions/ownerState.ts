import type { DatabaseReader } from "../_generated/server";
import { findMainChat } from "../_sessionChats/helpers";
import {
  findWorkSession,
  type OwnerChat,
  type OwnerEntity,
} from "./owner";

/**
 * Read-only owner lookups that need the chat modules. Kept apart
 * from the leaf `owner.ts`, which the schema validators import, so loading
 * the schema never pulls these modules into an import cycle.
 */

/**
 * The session chat a task or project talks in (the Main chat of its own
 * session), or null until something needed it (`ensureOwnerChat`).
 */
export async function findWorkChat(
  db: DatabaseReader,
  entity: OwnerEntity,
): Promise<OwnerChat | null> {
  const session = await findWorkSession(db, entity);
  if (!session) return null;
  const chat = await findMainChat(db, session._id);
  return chat ? { session, chat } : null;
}
