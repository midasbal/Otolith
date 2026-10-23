import { BALL, UNIT, integralPath } from "@/components/logo/geometry";
import { FIELD } from "@/components/background/logo-field";

/*
  Builds the integral's distance field from the logo's geometry, for
  exporting to public/logo/integral-field.png. Development only: the
  site ships the image, not this.

  The integral is drawn at four times the field's resolution and its
  distances measured there, then averaged down, so the stored edge sits
  where the true edge is to a small fraction of a texel.
*/
export function buildIntegralField(): { width: number; height: number; bytes: Uint8Array } {
  const OVER = 4;
  const width = Math.round(FIELD.x * 2 * FIELD.perUnit);
  const height = Math.round(FIELD.y * 2 * FIELD.perUnit);
  const W = width * OVER;
  const H = height * OVER;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas to draw the integral with.");
  const k = (FIELD.perUnit * OVER) / UNIT;
  context.translate(W / 2, H / 2);
  context.fill(new Path2D(integralPath(k)));
  for (const sign of [1, -1]) {
    context.beginPath();
    context.arc(sign * BALL.x * k, sign * BALL.y * k, BALL.r * k, 0, Math.PI * 2);
    context.fill();
  }
  const alpha = context.getImageData(0, 0, W, H).data;
  const inside = new Uint8Array(W * H);
  for (let i = 0; i < inside.length; i++) inside[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;

  // Squared distance to the nearest marked cell, by two passes of a one-dimensional transform.
  const INF = 1e12;
  const size = Math.max(W, H);
  const line = new Float64Array(size);
  const result = new Float64Array(size);
  const hull = new Int32Array(size);
  const breaks = new Float64Array(size + 1);
  const pass = (n: number) => {
    let top = 0;
    hull[0] = 0;
    breaks[0] = -INF;
    breaks[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = 0;
      do {
        const v = hull[top];
        s = (line[q] + q * q - (line[v] + v * v)) / (2 * q - 2 * v);
      } while (s <= breaks[top] && --top >= 0);
      top++;
      hull[top] = q;
      breaks[top] = s;
      breaks[top + 1] = INF;
    }
    top = 0;
    for (let q = 0; q < n; q++) {
      while (breaks[top + 1] < q) top++;
      const v = hull[top];
      result[q] = (q - v) * (q - v) + line[v];
    }
  };
  const distance = (marked: 0 | 1) => {
    const grid = new Float64Array(W * H);
    for (let i = 0; i < grid.length; i++) grid[i] = inside[i] === marked ? 0 : INF;
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) line[y] = grid[y * W + x];
      pass(H);
      for (let y = 0; y < H; y++) grid[y * W + x] = result[y];
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) line[x] = grid[y * W + x];
      pass(W);
      for (let x = 0; x < W; x++) grid[y * W + x] = result[x];
    }
    return grid;
  };
  const toInside = distance(1);
  const toOutside = distance(0);
  const reach = FIELD.spread * FIELD.perUnit * OVER;
  const bytes = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let j = 0; j < OVER; j++) {
        for (let i = 0; i < OVER; i++) {
          const at = (y * OVER + j) * W + (x * OVER + i);
          sum += inside[at] ? Math.sqrt(toOutside[at]) - 0.5 : 0.5 - Math.sqrt(toInside[at]);
        }
      }
      const signed = sum / (OVER * OVER);
      bytes[y * width + x] = Math.max(0, Math.min(255, Math.round((0.5 + signed / (2 * reach)) * 255)));
    }
  }
  return { width, height, bytes };
}
