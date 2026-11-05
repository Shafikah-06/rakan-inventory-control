"use client";

import { useEffect, useRef, useState } from "react";

const whole = (n: number) => Math.round(n).toLocaleString();

// A number that counts up to its value (and re-counts when the value changes).
// People who ask their device for less motion just see the final number.
export function CountUp({ value, format = whole, duration = 1100 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    let raf = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setShown(value));
      from.current = value;
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const a = from.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // fast start, gentle landing
      const v = a + (value - a) * eased;
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(shown)}</>;
}
