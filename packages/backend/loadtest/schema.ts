import { z } from "zod";

export const sampleSchema = z.object({
  clientMs: z.number(),
  serverMs: z.number().nullable(),
  userMs: z.number().nullable(),
  docsRead: z.number().nullable(),
  bytesRead: z.number().nullable(),
  returnBytes: z.number().nullable(),
  memoryMb: z.number().nullable(),
  cached: z.boolean().nullable(),
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
