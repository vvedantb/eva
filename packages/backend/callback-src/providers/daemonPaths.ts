import { ENTITY_ID, ENTITY_ID_FIELD } from "../config.js";

export type DaemonPaths = {
  pid: string;
  entity: string;
  opts: string;
};

/** Entity-scoped daemon marker paths so multiple daemons can coexist on one sandbox. */
export function resolveDaemonPaths(
  entityIdField: string | undefined = ENTITY_ID_FIELD,
  entityId: string | undefined = ENTITY_ID,
): DaemonPaths {
  const field = entityIdField ?? "sessionId";
  const id = entityId ?? "";
  const suffix = `${field}-${id}`;
  return {
    pid: `/tmp/eva-daemon.${suffix}.pid`,
    entity: `/tmp/eva-daemon.${suffix}.entity`,
    opts: `/tmp/eva-daemon.${suffix}.opts`,
  };
}
