import type { DatabaseReader } from "../_generated/server";
import { findMainChat } from "../_sessionChats/helpers";
import {
  findWorkSession,
  type OwnerChat,
  type OwnerEntity,
} from "./owner";

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
