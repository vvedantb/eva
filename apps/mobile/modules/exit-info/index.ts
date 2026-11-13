import { requireOptionalNativeModule } from "expo";
import { z } from "zod";

// `ExitInfoModule.kt`: why the app's last process ended, from Android 11+.
// Null on iOS, web, older Android, or when there is no record.

const exitSchema = z.object({
  reason: z.string(),
  timestamp: z.number(),
  description: z.string(),
  trace: z.string(),
});
export type LastExit = z.infer<typeof exitSchema>;

// zod wraps `lastExit` and checks what it resolves to.
const nativeSchema = z.object({ lastExit: z.function().args().returns(z.promise(exitSchema.nullable())) });

/** Never throws: a missing module or an unexpected shape is null. */
export async function lastExit(): Promise<LastExit | null> {
  const parsed = nativeSchema.safeParse(requireOptionalNativeModule("ExitInfo"));
  if (!parsed.success) return null;
  try {
    return await parsed.data.lastExit();
  } catch {
    return null;
  }
}
