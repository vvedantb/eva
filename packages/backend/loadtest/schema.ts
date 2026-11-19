// Shape of loadtest/results/<label>.json. Parsed with Zod when written and
// when the report reads it back, so the two scripts cannot drift.
import { z } from "zod";

export const sampleSchema = z.object({
  /** Round trip from the runner, including HTTP overhead. */
  clientMs: z.number(),
  /** Server-reported execution time (function log stream). */
  serverMs: z.number().nullable(),
  /** Server-reported time inside user JS. */
  userMs: z.number().nullable(),
  /** Documents the backend read for this execution (includes filter scans). */
  docsRead: z.number().nullable(),
  bytesRead: z.number().nullable(),
  returnBytes: z.number().nullable(),
  memoryMb: z.number().nullable(),
  cached: z.boolean().nullable(),
  /** First line of the error, when the query failed. */
  error: z.string().nullable(),
});
export type Sample = z.infer<typeof sampleSchema>;

export const caseResultSchema = z.object({
  name: z.string(),
  surface: z.string(),
  samples: z.array(sampleSchema),
});
export type CaseResult = z.infer<typeof caseResultSchema>;

export const scaleResultSchema = z.object({
  scale: z.number(),
  /** Measured rounds at this scale (older files: see `samplesPerCase`). */
  samples: z.number().optional(),
  seedMs: z.number(),
  seedDocs: z.number(),
  tableCounts: z.record(z.string(), z.number()),
  cases: z.array(caseResultSchema),
});
export type ScaleResult = z.infer<typeof scaleResultSchema>;

export const resultsFileSchema = z.object({
  label: z.string(),
  gitSha: z.string(),
  startedAt: z.string(),
  samplesPerCase: z.number(),
  warmupRounds: z.number(),
  scales: z.array(scaleResultSchema),
});
export type ResultsFile = z.infer<typeof resultsFileSchema>;
