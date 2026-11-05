"use client";

import { useEffect, useRef, useState } from "react";

// Presentation page: the same app on a laptop and a phone, side by side.
// Both screens scroll by themselves so a screen recording looks alive.
export default function Demo() {
  const laptop = useRef<HTMLIFrameElement>(null);
  const phone = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const dir = { laptop: 1, phone: 1 };
    const step = (ref: React.RefObject<HTMLIFrameElement | null>, key: "laptop" | "phone", px: number) => {
      const win = ref.current?.contentWindow;
      const doc = ref.current?.contentDocument?.scrollingElement;
      if (!win || !doc) return;
      win.scrollBy(0, dir[key] * px);
      const max = doc.scrollHeight - doc.clientHeight;
      if (max > 0 && win.scrollY >= Math.min(max, key === "laptop" ? 1500 : 2600)) dir[key] = -1;
      if (win.scrollY <= 0) dir[key] = 1;
    };
    const t = setInterval(() => {
      step(laptop, "laptop", 3);
      step(phone, "phone", 4);
    }, 30);
    return () => clearInterval(t);
  }, []);

  // Shrink the whole laptop+phone picture to fit whatever window it is opened in.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, window.innerWidth / 1300, window.innerHeight / 700));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900">
    <main
      className="absolute left-1/2 top-1/2 flex items-center justify-center gap-10"
      style={{ width: 1300, height: 680, transform: `translate(-50%, -50%) scale(${scale})` }}
    >
      {/* Laptop: 1280x800 screen shown at 65% */}
      <div className="flex flex-col items-center">
        <div className="rounded-t-2xl bg-slate-700 p-2.5 pb-2">
          <div className="overflow-hidden rounded-md bg-white" style={{ width: 832, height: 520 }}>
            <iframe
              ref={laptop}
              src="/"
              title="Laptop view"
              style={{ width: 1280, height: 800, border: 0, transform: "scale(0.65)", transformOrigin: "top left" }}
            />
          </div>
        </div>
        <div className="h-3 rounded-b-xl bg-slate-500" style={{ width: 900 }} />
        <p className="mt-3 text-sm font-medium text-slate-300">Laptop</p>
      </div>

      {/* Phone: 390x800 screen shown at 70% */}
      <div className="flex flex-col items-center">
        <div className="rounded-[2.2rem] bg-slate-700 p-2.5">
          <div className="overflow-hidden rounded-[1.7rem] bg-white" style={{ width: 273, height: 560 }}>
            <iframe
              ref={phone}
              src="/"
              title="Phone view"
              style={{ width: 390, height: 800, border: 0, transform: "scale(0.7)", transformOrigin: "top left" }}
            />
          </div>
        </div>
        <p className="mt-3 text-sm font-medium text-slate-300">Phone</p>
      </div>
    </main>
    </div>
  );
}
