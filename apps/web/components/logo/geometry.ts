/*
  The Otolith logo as geometry: a filled half-disc standing on an axis, an
  outlined half-disc hanging from it, and an integral sign joining them
  where they meet.

  Traced from the logo artwork and then cleaned: the two halves are the
  same circular segment (as drawn they differ by a few percent), the
  integral is exactly point-symmetric, and its centre sits on the axis.
  Everything that draws the logo, the mark, the favicon and the
  background scene, reads these numbers, so the logo has one shape.

  Units here are the artwork's pixels, with the origin where the integral
  crosses the axis and y running down, as in SVG. `UNIT` is half the
  width of one half-disc; divide by it for the scene's own units.
*/

type Point = readonly [number, number];
type Cubic = readonly [Point, Point, Point, Point];

/** Half the width of a half-disc where it meets the axis. */
export const UNIT = 408.7;

export const HALF = {
  /** The radius of the circle each half is cut from. */
  radius: 416.7,
  /** How far that circle's centre lies beyond the axis: the halves are a little less than semicircles. */
  drop: 81.1,
  /** The height of a half above (or below) the axis. */
  height: 335.6,
  /** From the origin to the near corner of each half. */
  gap: 4,
  /** The outlined half's stroke, and the axis line's. */
  stroke: 4,
} as const;

/** The centre of each half's chord on the axis. */
export const FILLED_X = -(HALF.gap + UNIT);
export const OUTLINED_X = HALF.gap + UNIT;

/*
  The integral, upper half. Each edge leaves the centre as a straight
  stem and then takes two curves: the outer edge over the top of the hook
  to the ball, the inner edge up into the notch where the ball hangs.
  The lower half is the same, turned through 180 degrees.
*/
const OUTER = {
  start: [-16.8, 0] as Point,
  curves: [
    [[25.2, -130.8], [52, -214.4], [101.9, -331.4], [206.6, -330.7]],
    [[206.6, -330.7], [212.2, -330.7], [214.8, -330.4], [220.2, -329.8]],
  ] as readonly Cubic[],
};
const INNER = {
  start: [16.8, 0] as Point,
  curves: [
    [[56.5, -123.8], [71, -168.8], [86.5, -235.3], [114.6, -274]],
    [[114.6, -274], [135.5, -302.7], [170.6, -326.2], [207, -322.8]],
  ] as readonly Cubic[],
};
export const BALL = { x: 233.2, y: -292.6, r: 39.2 } as const;

const turn = ([x, y]: Point): Point => [-x, -y];
const number = (value: number) => String(Math.round(value * 100) / 100);

/** The integral's stroke as one closed SVG path (without its two balls), scaled by `k`. */
export function integralPath(k = 1): string {
  const at = ([x, y]: Point) => `${number(x * k)} ${number(y * k)}`;
  const half = (map: (point: Point) => Point) => {
    let d = `L${at(map(OUTER.curves[0][0]))}`;
    for (const curve of OUTER.curves) d += `C${at(map(curve[1]))} ${at(map(curve[2]))} ${at(map(curve[3]))}`;
    // Through the ball's centre to the notch: hidden under the ball, and it leaves no sliver beside it.
    d += `L${at(map([BALL.x, BALL.y]))}L${at(map(INNER.curves[1][3]))}`;
    for (const curve of [...INNER.curves].reverse()) d += `C${at(map(curve[2]))} ${at(map(curve[1]))} ${at(map(curve[0]))}`;
    return `${d}L${at(map(INNER.start))}`;
  };
  return `M${at(OUTER.start)}${half((point) => point)}${half(turn)}Z`;
}

/** A half-disc standing on the axis as an SVG path: closed for the filled half, open (arc only) for the outlined one. */
export function halfPath(side: "filled" | "outlined", k = 1): string {
  const centre = side === "filled" ? FILLED_X : OUTLINED_X;
  const from = number((centre - UNIT) * k);
  const to = number((centre + UNIT) * k);
  const r = number(HALF.radius * k);
  return side === "filled" ? `M${from} 0A${r} ${r} 0 0 1 ${to} 0Z` : `M${from} 0A${r} ${r} 0 0 0 ${to} 0`;
}

/**
 * The box the whole logo fits in, with a little air: the SVG's viewBox,
 * and the box the background scene fits into a stage. Because they are
 * the same box, the logo drawn as SVG in a stage and the logo the scene
 * draws there coincide exactly.
 */
export const VIEW_BOX = { x: -850, y: -360, width: 1700, height: 720 } as const;
