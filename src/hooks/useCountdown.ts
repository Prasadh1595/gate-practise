import { useEffect, useRef, useState } from 'react';

/**
 * Refresh-safe countdown. initialRemainingSeconds is `null` until real attempt data
 * has loaded, OR permanently null if the test has no time limit at all (most PYQ
 * topic tests, since none specify a duration in the source). The timer target is
 * only ever locked in once, the first time a real (non-null) value arrives.
 */
export function useCountdown(initialRemainingSeconds: number | null, onExpire: () => void) {
  const targetRef = useRef<number | null>(null);
  const [remaining, setRemaining] = useState<number>(initialRemainingSeconds ?? 0);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (initialRemainingSeconds === null) return;
    if (targetRef.current !== null) return;
    targetRef.current = Date.now() + initialRemainingSeconds * 1000;
    setRemaining(initialRemainingSeconds);
  }, [initialRemainingSeconds]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (targetRef.current === null) return;
      const secsLeft = Math.max(0, Math.round((targetRef.current - Date.now()) / 1000));
      setRemaining(secsLeft);
      if (secsLeft <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(interval);
        onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return remaining;
}

export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
