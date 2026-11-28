import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeSchemaNarrowing,
  historicMigrationExports,
  unresolvedMigrations,
} from "./check-schema-narrowing.mjs";

const TABLE_FIELDS = "packages/backend/convex/_validators/tableFields.ts";
const SCHEMA = "packages/backend/convex/schema.ts";
const ENUMS = "packages/backend/convex/_validators/enums.ts";

function diffFor(file, body) {
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    body,
  ].join("\n");
}

const NO_MIGRATIONS = "export const run = dataMigrations.runner();\n";

test("passes when nothing is removed", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      ["@@ -10,0 +11 @@", "+  planContent: v.optional(v.string()),"].join("\n"),
    ),
    newContent: "planContent: v.optional(v.string()),",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.removals, []);
});

test("fails on the turnLifecycleVersion removal from the revert incident", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      [
        "@@ -374,6 +372,0 @@ export const sessionFields = {",
        "-  /**",
        "-   * Set the first time this session opens a durable Turn.",
        "-   */",
        "-  turnLifecycleVersion: v.optional(v.literal(2)),",
      ].join("\n"),
    ),
    newContent:
      "export const sessionFields = {\n  planContent: v.optional(v.string()),\n};",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unmarked");
  assert.equal(result.removals.length, 1);
  assert.equal(result.removals[0].name, "turnLifecycleVersion");
  assert.equal(result.removals[0].kind, "field");
  assert.equal(result.removals[0].file, TABLE_FIELDS);
  assert.equal(result.removals[0].line, 377);
});

test("ignores a field that moved to the other watched file", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      ["@@ -20 +19,0 @@", "-  planContent: v.optional(v.string()),"].join("\n"),
    ),
    newContent: "planContent: v.optional(v.string()),",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, true);
});

test("ignores a rename of the surrounding validator const", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      [
        "@@ -162,2 +162,2 @@",
        "-export const turnStateValidator = v.union(",
        "+export const retiredTurnStateValidator = v.union(",
      ].join("\n"),
    ),
    newContent: "export const retiredTurnStateValidator = v.union(",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, true);
});

test("flags a removed table", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      SCHEMA,
      ["@@ -163 +162,0 @@", "-  turns: defineTable(turnFields)"].join("\n"),
    ),
    newContent:
      "const schema = defineSchema({ users: defineTable(userFields) });",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.removals[0].kind, "table");
  assert.equal(result.removals[0].name, "turns");
});

test("flags a removed union member", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      ["@@ -170 +169,0 @@", '-  v.literal("cancelled"),'].join("\n"),
    ),
    newContent: 'v.union(v.literal("running"), v.literal("failed"))',
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.removals[0].kind, "union member");
  assert.equal(result.removals[0].name, "cancelled");
});

test("ignores a union member that only moved within the file", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      ["@@ -170 +169,0 @@", '-  v.literal("cancelled"),'].join("\n"),
    ),
    newContent: 'v.union(v.literal("cancelled"), v.literal("running"))',
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, true);
});

test("never flags comment lines", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      [
        "@@ -30,3 +29,0 @@",
        "-  // legacyField: v.optional(v.string()),",
        "-   * legacyDoc: v.string()",
        "-  /** shadowField: v.number() */",
      ].join("\n"),
    ),
    newContent: "export const sessionFields = {};",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, true);
});

test("flags a removed union member in the stored enums file", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      ENUMS,
      ["@@ -44 +43,0 @@", '-  "cancelled",'].join("\n") +
        "\n" +
        ["@@ -60 +59,0 @@", '-  v.literal("retry_pending"),'].join("\n"),
    ),
    newContent: 'v.union(v.literal("scheduled"))',
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.removals[0].name, "retry_pending");
  assert.equal(result.removals[0].file, ENUMS);
});

test("ignores diffs to files outside the watched set", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      "packages/backend/convex/sessions.ts",
      ["@@ -5 +4,0 @@", "-  someField: v.string(),"].join("\n"),
    ),
    newContent: "",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, true);
});

test("marker plus a matching migration lets the removal through", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      [
        "@@ -374,2 +372,1 @@",
        "-  turnLifecycleVersion: v.optional(v.literal(2)),",
        "+  // schema-narrowing-ok: clearTurnLifecycleVersion",
      ].join("\n"),
    ),
    newContent: "export const sessionFields = {};",
    migrationsSource:
      "export const clearTurnLifecycleVersion = dataMigrations.define({});\n",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.markers, ["clearTurnLifecycleVersion"]);
  assert.equal(result.removals.length, 1);
});

test("an inline marker on the removed line itself also counts", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      [
        "@@ -374 +373,0 @@",
        "-  turnLifecycleVersion: v.optional(v.literal(2)), // schema-narrowing-ok: clearTurnLifecycleVersion",
      ].join("\n"),
    ),
    newContent: "export const sessionFields = {};",
    migrationsSource:
      "export async function clearTurnLifecycleVersion(ctx) {}\n",
  });
  assert.equal(result.ok, true);
});

test("a migration deleted by this change still counts, via the base revision", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      [
        "@@ -374,2 +372,1 @@",
        "-  turnLifecycleVersion: v.optional(v.literal(2)),",
        "+  // schema-narrowing-ok: clearTurnLifecycleVersion",
      ].join("\n"),
    ),
    newContent: "export const sessionFields = {};",
    migrationsSource: `${NO_MIGRATIONS}\nexport const clearTurnLifecycleVersion = dataMigrations.define({});\n`,
  });
  assert.equal(result.ok, true);
});

test("marker naming a migration that does not exist still fails", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      [
        "@@ -374,2 +372,1 @@",
        "-  turnLifecycleVersion: v.optional(v.literal(2)),",
        "+  // schema-narrowing-ok: clearTurnLifecycleVersion",
      ].join("\n"),
    ),
    newContent: "export const sessionFields = {};",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing-migration");
  assert.deepEqual(result.missingMigrations, ["clearTurnLifecycleVersion"]);
});

test("reports each removed name once, across both watched files", () => {
  const result = analyzeSchemaNarrowing({
    diff: [
      diffFor(
        SCHEMA,
        ["@@ -163 +162,0 @@", "-  turns: defineTable(turnFields)"].join("\n"),
      ),
      diffFor(
        TABLE_FIELDS,
        [
          "@@ -190,2 +189,0 @@",
          "-  leaseExpiresAt: v.number(),",
          "-  leaseExpiresAt: v.number(),",
        ].join("\n"),
      ),
    ].join("\n"),
    newContent: "const schema = defineSchema({});",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.removals.map((r) => r.name).toSorted(), [
    "leaseExpiresAt",
    "turns",
  ]);
});

test("a quoted field key is recognised", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      ["@@ -12 +11,0 @@", '-  "legacy.flag": v.optional(v.boolean()),'].join(
        "\n",
      ),
    ),
    newContent: "export const appSettingsFields = {};",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.removals[0].name, "legacy.flag");
});

test("a marker that names its field still needs a real migration", () => {
  const result = analyzeSchemaNarrowing({
    diff: diffFor(
      TABLE_FIELDS,
      [
        "@@ -374,2 +372,1 @@",
        "-  turnLifecycleVersion: v.optional(v.literal(2)),",
        "+  // turnLifecycleVersion removed. schema-narrowing-ok: clearTurnLifecycle",
      ].join("\n"),
    ),
    newContent:
      "export const sessionFields = {\n  // turnLifecycleVersion removed. schema-narrowing-ok: clearTurnLifecycle\n};",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing-migration");
  assert.deepEqual(result.removals, []);
  assert.deepEqual(result.missingMigrations, ["clearTurnLifecycle"]);
});

test("an existing marker outside the diff is checked too", () => {
  const result = analyzeSchemaNarrowing({
    diff: "",
    newContent: "// schema-narrowing-ok: neverWritten\nexport const a = {};",
    migrationsSource: NO_MIGRATIONS,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingMigrations, ["neverWritten"]);
});

test("git history resolves a one-off migration deleted after it ran", () => {
  const names = ["clearLegacyFields", "zzzNeverAMigration"];
  assert.deepEqual(
    unresolvedMigrations(names, historicMigrationExports(names)),
    ["zzzNeverAMigration"],
  );
});
