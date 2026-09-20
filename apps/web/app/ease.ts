/**
 * A JavaScript evaluator for the signature easing curve, so a value driven
 * by requestAnimationFrame (a number counting down, say) can resolve on
 * exactly the same curve as a CSS transition using --ease-settle. Without
 * this, the two would drift apart: the marker settling on one curve while
 * the figure beside it counted down on a different one.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const a = (a1: number, a2: number) => 1.0 - 3.0 * a2 + 3.0 * a1;
  const b = (a1: number, a2: number) => 3.0 * a2 - 6.0 * a1;
  const c = (a1: number) => 3.0 * a1;

  const bezier = (t: number, a1: number, a2: number) =>
    ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;

  const slope = (t: number, a1: number, a2: number) =>
    3.0 * a(a1, a2) * t * t + 2.0 * b(a1, a2) * t + c(a1);

  function tForX(x: number) {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const currentSlope = slope(t, x1, x2);
      if (currentSlope === 0) return t;
      t -= (bezier(t, x1, x2) - x) / currentSlope;
    }
    return t;
  }

  return (x: number) => bezier(tForX(x), y1, y2);
}

/** The signature curve, matching CSS `var(--ease-settle)` exactly. */
export const easeSettle = cubicBezier(0.16, 1, 0.3, 1);
