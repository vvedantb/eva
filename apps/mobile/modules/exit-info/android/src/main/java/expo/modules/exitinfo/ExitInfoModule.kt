package expo.modules.exitinfo

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Why this app's last process ended (Android 11+ `ApplicationExitInfo`). A
 * native crash closes the app before JavaScript can save anything; Android
 * keeps the record (and, for a native crash, the tombstone), so the next
 * launch can show it.
 */
class ExitInfoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExitInfo")

    AsyncFunction("lastExit") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@AsyncFunction null
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val info = manager.getHistoricalProcessExitReasons(context.packageName, 0, 1).firstOrNull()
        ?: return@AsyncFunction null
      mapOf(
        "reason" to reasonName(info.reason),
        "timestamp" to info.timestamp.toDouble(),
        "description" to (info.description ?: ""),
        "trace" to readTrace(info),
      )
    }
  }

  @RequiresApi(Build.VERSION_CODES.R)
  private fun reasonName(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_CRASH -> "crash"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "crash_native"
    ApplicationExitInfo.REASON_ANR -> "anr"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "low_memory"
    ApplicationExitInfo.REASON_EXIT_SELF -> "exit_self"
    ApplicationExitInfo.REASON_SIGNALED -> "signaled"
    ApplicationExitInfo.REASON_USER_REQUESTED -> "user_requested"
    else -> "other_$reason"
  }

  /**
   * The readable parts of the trace: an ANR trace is text; a native crash
   * tombstone is a protobuf, so keep its printable runs (signal, abort
   * message, library and function names), as `strings` would.
   */
  @RequiresApi(Build.VERSION_CODES.R)
  private fun readTrace(info: ApplicationExitInfo): String {
    val bytes = try {
      info.traceInputStream?.use { it.readBytes() } ?: return ""
    } catch (e: Exception) {
      return ""
    }
    val runs = StringBuilder()
    val current = StringBuilder()
    for (b in bytes) {
      val c = b.toInt() and 0xff
      if (c in 0x20..0x7e) {
        current.append(c.toChar())
      } else {
        if (current.length >= 4) runs.append(current).append('\n')
        current.setLength(0)
      }
      if (runs.length > 6000) break
    }
    if (current.length >= 4) runs.append(current)
    return runs.toString().take(6000)
  }
}
