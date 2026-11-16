import React, { useEffect, useRef } from "react";

interface WaterLineProps {
  /** The voice, 0..1, written by the mic-level listener; read every frame. */
  level: React.MutableRefObject<number>;
  /** Transcribing: the water just moves gently, whatever the level. */
  calm?: boolean;
  className?: string;
}

// Three translucent layers of one stream, each a little out of phase, so the
// water twists the way a real jet does.
const STRANDS = [
  { phase: 0.0, offset: 0, thickness: 3.8, alpha: 0.6 },
  { phase: 0.3, offset: -0.6, thickness: 2.4, alpha: 0.45 },
  { phase: 0.55, offset: 0.7, thickness: 1.8, alpha: 0.4 },
];
const POINTS = 64;
const MAX_BUBBLES = 6;

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
  age: number;
}

/**
 * A strip of water seen from the side. Silent it lies flat and smooth;
 * speaking makes it wobble in waves, and now and then a bubble drifts off
 * below it. Drawn on a canvas each frame while mounted.
 */
const WaterLine: React.FC<WaterLineProps> = ({
  level,
  calm = false,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read each frame, so going calm eases the water down instead of
  // restarting the loop (which made the wave jump).
  const calmRef = useRef(calm);
  calmRef.current = calm;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = matchMedia("(prefers-color-scheme: light)");
    let raf = 0;
    let smooth = 0;
    let calmMix = calmRef.current ? 1 : 0;
    let phase = 0;
    let drift = 0;
    let bubbles: Bubble[] = [];
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (w < 2) {
        raf = requestAnimationFrame(frame);
        return;
      }

      // Rises quickly with a syllable, settles slowly, so it reads as water.
      // Time-based, so it feels the same at 60 and 120 Hz. Room noise under
      // the floor is ignored, so silence really lies still.
      const calmNow = calmRef.current;
      // Reduced motion: the water stays flat and the voice shows as brightness.
      const raw = calmNow ? 0 : level.current;
      // A gentle curve lifts normal speech so the wobble reads, peaks unchanged.
      const target = Math.pow(Math.max(0, (raw - 0.05) / 0.95), 0.6);
      const tau = target > smooth ? 0.08 : 0.35;
      smooth += (target - smooth) * (1 - Math.exp(-dt / tau));
      calmMix += ((calmNow ? 1 : 0) - calmMix) * (1 - Math.exp(-dt / 0.4));
      // Transcribing: a slow, gentle swell of its own.
      const voiceGlow = still ? 0.6 + 0.4 * smooth : 1;
      const k = still ? 0 : Math.max(smooth, 0.2 * calmMix);
      // Quiet water drifts slowly; speech makes it travel.
      if (!still) {
        phase += dt * (1.4 + 3.2 * k) * (1 - 0.45 * calmMix);
        drift += dt;
      }
      const s = phase;
      const mid = h * 0.5;

      const edgeOf = (u: number) => Math.sin(Math.PI * u) ** 0.9;
      const curve = (strand: (typeof STRANDS)[number], sign: number) => {
        const points: [number, number][] = [];
        for (let i = 0; i <= POINTS; i++) {
          const u = i / POINTS;
          const edge = edgeOf(u);
          const amp = (0.15 + 4.5 * k) * edge;
          const y =
            mid +
            strand.offset * (0.1 + 1.3 * k) +
            Math.sin(u * 7.5 - s + strand.phase) * amp +
            Math.sin(u * 15 + s * 0.65 + strand.phase * 1.7) * amp * 0.28 +
            Math.sin(u * 3 - drift * 1.3) * 0.6 * k;
          const thickness =
            strand.thickness *
            (0.85 + 0.35 * k * Math.sin(u * 11 + s * 0.4 + strand.phase)) *
            (0.7 + 0.5 * edge) *
            (1 + 0.25 * k);
          points.push([u * w, y + sign * thickness]);
        }
        return points;
      };

      // On light glass a white rim vanishes, so the water carries its own
      // blue edges there and a darker underside.
      const onLight = light.matches;
      const body = ctx.createLinearGradient(0, mid - 12, 0, mid + 12);
      if (onLight) {
        body.addColorStop(0, "rgba(90,140,210,0.85)");
        body.addColorStop(0.4, "rgba(64,120,205,0.8)");
        body.addColorStop(0.55, "rgba(20,60,140,0.85)");
        body.addColorStop(1, "rgba(90,140,210,0.85)");
      } else {
        body.addColorStop(0, "rgba(235,244,255,0.95)");
        body.addColorStop(0.35, "rgba(120,170,235,0.75)");
        body.addColorStop(0.55, "rgba(28,72,150,0.8)");
        body.addColorStop(0.8, "rgba(110,160,225,0.7)");
        body.addColorStop(1, "rgba(220,235,255,0.9)");
      }
      // Calm water is a little quieter in colour, so working doesn't read as
      // listening to silence.
      const tone = (1 - 0.4 * calmMix) * voiceGlow;

      STRANDS.forEach((strand, index) => {
        const top = curve(strand, -1);
        const bottom = curve(strand, 1);
        ctx.beginPath();
        top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        for (let i = bottom.length - 1; i >= 0; i--) {
          ctx.lineTo(bottom[i][0], bottom[i][1]);
        }
        ctx.closePath();
        // Silent water stays clearly "on": a little stronger when flat.
        ctx.globalAlpha =
          Math.min(1, strand.alpha * (1 + 0.35 * (1 - k))) * tone;
        ctx.fillStyle = body;
        ctx.fill();
        // Light along the top edge, a faint fold through the middle.
        ctx.globalAlpha = 0.9 * tone * (1 - 0.5 * calmMix);
        ctx.beginPath();
        top.forEach(([x, y], i) =>
          i ? ctx.lineTo(x, y + 0.5) : ctx.moveTo(x, y + 0.5),
        );
        ctx.strokeStyle = onLight
          ? "rgba(255,255,255,0.6)"
          : "rgba(255,255,255,0.7)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
        // One fold, on the main body only, so quiet water reads as one band.
        if (index > 0) return;
        ctx.beginPath();
        top.forEach(([x, y], i) => {
          const fold = (y + bottom[i][1]) / 2 + 0.6;
          if (i) ctx.lineTo(x, fold);
          else ctx.moveTo(x, fold);
        });
        ctx.strokeStyle = onLight
          ? "rgba(10,35,85,0.3)"
          : "rgba(10,35,85,0.18)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // Only the odd bubble, on loud stretches.
      if (
        !calmNow &&
        k > 0.35 &&
        bubbles.length < MAX_BUBBLES &&
        Math.random() < 0.035 * k
      ) {
        bubbles.push({
          x: 15 + Math.random() * (w - 30),
          y: mid + 4 + Math.random() * 3,
          r: 0.6 + Math.random() * 1.2,
          speed: 3 + Math.random() * 5,
          age: 0,
        });
      }
      bubbles = bubbles.filter((b) => b.age < 1.4 && b.y < h);
      for (const b of bubbles) {
        b.age += dt;
        b.y += b.speed * dt;
        b.x += Math.sin(b.age * 6) * 0.08;
        const fade = Math.min(1, (1.4 - b.age) * 1.5);
        // Filled, soft bubbles: hollow rings this small read as debris.
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = onLight
          ? `rgba(41,115,219,${0.35 * fade})`
          : `rgba(160,200,255,${0.35 * fade})`;
        ctx.fill();
        ctx.strokeStyle = onLight
          ? `rgba(40,90,170,${0.7 * fade})`
          : `rgba(225,238,255,${0.8 * fade})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.fill();
      }

      // Soft ends.
      ctx.globalCompositeOperation = "destination-in";
      const ends = ctx.createLinearGradient(0, 0, w, 0);
      ends.addColorStop(0, "rgba(0,0,0,0)");
      ends.addColorStop(0.1, "#000");
      ends.addColorStop(0.9, "#000");
      ends.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ends;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [level]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
};

export default WaterLine;
