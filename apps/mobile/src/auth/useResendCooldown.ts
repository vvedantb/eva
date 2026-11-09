// useEffect: the 1 s tick while a resend cooldown is live (interval, not derived state).
import { useEffect, useState } from "react";

/**
 * Counts down `seconds` after `start()`. The one effect is the 1 s timer, which runs
 * only while the countdown is live. `remaining` is whole seconds left (0 = ready).
 */
export function useResendCooldown(seconds: number) {
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (endsAt === 0) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const start = () => {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + seconds * 1000);
  };

  return { remaining: Math.max(0, Math.ceil((endsAt - now) / 1000)), start };
}
