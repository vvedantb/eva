/**
 * Schema building blocks for untrusted provider-stream JSON.
 *
 * Provider events arrive with fields padded, blank, missing, or of the wrong
 * type — and the parser must never throw or drop the sibling fields the old
 * hand-rolled narrowing kept. `lenient` is what makes that hold: a field that
 * fails its schema decodes to `undefined` instead of failing the whole struct.
 */

import { Schema } from "effect";

/** Matches any input and decodes to `undefined` — the fallback arm of `lenient`. */
export const Absent = Schema.transform(Schema.Unknown, Schema.Undefined, {
  strict: true,
  decode: () => undefined,
  encode: () => undefined,
});

/** The decoded value when the input matches, `undefined` when it does not. */
export const lenient = <A, I>(schema: Schema.Schema<A, I>) =>
  Schema.Union(schema, Absent);

/** Trimmed text, rejecting blanks — stream fields arrive padded or empty. */
export const Text = Schema.Trim.pipe(Schema.nonEmptyString());

/** Non-empty text kept as written — for fields the UI emits verbatim (whitespace counts). */
export const NonEmptyText = Schema.String.pipe(Schema.nonEmptyString());

export const OptionalText = Schema.optional(lenient(Text));

/** Trimmed, non-blank entries; entries of any other shape are dropped. */
export const TextArray = Schema.transform(
  Schema.Array(lenient(Text)),
  Schema.Array(Schema.String),
  {
    strict: true,
    decode: (entries) =>
      entries.flatMap((entry) => (entry === undefined ? [] : [entry])),
    encode: (entries) => entries,
  },
);
