import { requireOptionalNativeModule } from "expo";
import { z } from "zod";


const exitSchema = z.object({
  reason: z.string(),
  timestamp: z.number(),
  description: z.string(),
  trace: z.string(),
});
export type LastExit = z.infer<typeof exitSchema>;

const nativeSchema = z.object({
  lastExit: z.custom<() => Promise<unknown>>((value) => typeof value === "function"),
});

/** Never throws: a missing module or an unexpected shape is null. */
export async function lastExit(): Promise<LastExit | null> {
  const parsed = nativeSchema.safeParse(requireOptionalNativeModule("ExitInfo"));
  if (!parsed.success) return null;
  try {
    const exit = exitSchema.nullable().safeParse(await parsed.data.lastExit());
    return exit.success ? exit.data : null;
  } catch {
    return null;
  }
}
