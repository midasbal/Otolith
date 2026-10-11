import { FILLED_X, HALF, OUTLINED_X, UNIT, VIEW_BOX } from "@/components/logo/geometry";
import { compile, uniforms, type ConceptDef, type Frame, type Stage } from "./engine";
import { FIELD, type LogoField } from "./logo-field";

/*
  The logo as a scene: the page's five chapters told with the logo's own
  three shapes, in particles.

    0  Hero       the logo, whole, breathing
    1  Drift      it comes apart into two vessels and the path between
                  them: the left one overfull, heaped and spilling, the
                  right one all but empty, the whole leaning to the heavy
                  side
    2  Return     the integral uncoils into a path, and the ink pours
                  along it from the left vessel into the right until the
                  two hold the same, and the lean comes level
    3  Bounds     the axis widens into a band, and everything flows inside
                  it; what pushes at the edge is turned back
    4  Rest       the exact logo again, still

  Every particle has a place in the logo (in the filled half, on the
  outline, or in the integral) and a place in each of those pictures.
  Which picture is shown follows the page; between two pictures a
  particle does not go straight: it is carried by a current (the curl of
  a few drifting waves, so it never bunches or thins), most strongly
  halfway.

  The pour is the one thing with a pace of its own. The page says how
  far it should have gone (nothing while the logo is whole, a little by
  the drift, all of it by the return; and back to a little while the
  simulator says the example portfolio is drifting), and the pour
  follows that over a few seconds, however fast the page was scrolled.
  A particle of the filled half leaves the left vessel when the pour
  reaches it, the highest first, so the level falls; it travels the path
  for two seconds, and comes to lie in the right vessel as it lay in the
  left, turned over, so the lowest place fills first and the level
  rises. Nothing is made or lost: every one of those particles is in the
  left vessel, on the path, or in the right. When the pour turns back,
  they turn round where they are and go back the same way. The scene
  remembers only how far the pour had gone at each moment of the last
  two seconds; each particle is followed through that, and so knows
  where it is.

  A particle that is moving draws a short trail: a line from where it was
  a tenth of a second ago to where it is, fading to nothing at the far
  end. The trail is as long as the particle is fast, so a current shows
  as streaks, and a particle that has settled has none.

  Under the particles lies the logo drawn exactly (arcs and lines by
  arithmetic, the integral from a distance field of its outline). Whole,
  it is the logo as it is: the left half solid, the right half a line.
  While the halves are vessels, from the moment the logo comes apart
  until it is whole again, both are drawn as that same thin line, and
  the ink inside them is the particles' alone; one fades into the other.

  Where the page has left room for the scene (a stage box to a chapter),
  each picture is drawn in its chapter's box and travels from one box to
  the next between chapters. Without boxes it places itself on the screen.

  All lengths in the shaders are logo units: 1 is half the width of a
  half-disc, y runs up.
*/

/** The two themes' ground and ink: the logo's own colors, and the same two exchanged. Keep in step with tokens.css. */
const LIGHT = { ground: [241, 235, 230], ink: [35, 30, 29] };
const DARK = { ground: [15, 13, 13], ink: [241, 235, 230] };

// The logo, in scene units.
const R = HALF.radius / UNIT;
const DROP = HALF.drop / UNIT;
const HEIGHT = HALF.height / UNIT;
const GAP = HALF.gap / UNIT;
const STROKE = HALF.stroke / UNIT;
const LEFT = FILLED_X / UNIT;
const RIGHT = OUTLINED_X / UNIT;

/**
 * How far past a block of text the scene stays dimmed, in CSS pixels: each
 * particle's own dimming, and the veil's feather. Kept shorter than the gap
 * the page leaves between its text and a stage, so the logo is never dimmed
 * where it stands.
 */
const DIM_REACH = 30;
const VEIL_REACH = 36;

/** How far back a trail reaches, in seconds, and the longest it is drawn, in logo units. */
const TRAIL_SECONDS = 0.09;
const TRAIL_MAX = 0.095;

/**
 * The pour. How far it has gone is one number, from 0 (everything in the left vessel) to 1 (the two level), and the
 * scene keeps what that number was at each of PAST moments, STEP seconds apart. A particle is TRANSIT seconds on
 * the path, a little less than the time remembered, so it has arrived before the moment it set off is forgotten.
 */
const PAST = 16;
const STEP = 0.14;
const TRANSIT = 2.0;
/** How far the pour has gone while the portfolio is out of balance: a little lies in the right vessel already. */
const POUR_AT_DRIFT = 0.05;
/** How quickly the pour follows where the page says it should be: a critically damped spring, about four seconds to nine tenths. */
const POUR_PACE = 1.1;
/** The lean of the whole toward the heavy side while it is out of balance, in radians. */
const LEAN = 0.085;

/** The logo's box in logo units, with a little air: what a stage box is fitted to (the SVG's own viewBox). */
const FIT = { width: VIEW_BOX.width / UNIT, height: VIEW_BOX.height / UNIT };

const f = (value: number) => (Number.isInteger(value) ? `${value}.0` : String(value));

const SHARED = `
const float PI = 3.14159265;
const float R = ${f(R)};
const float DROP = ${f(DROP)};
const float GAP = ${f(GAP)};
const float LEFT = ${f(LEFT)};
const float RIGHT = ${f(RIGHT)};
uniform vec4 uQuiet[4];
uniform float uReach;   // how far past a block of text the dimming reaches, in buffer pixels
// 1 inside a block of text, falling away smoothly outside it.
float quietAt(vec2 at, vec4 box, float reach) {
  vec2 d = max(box.xy - at, at - box.zw);
  float outside = length(max(d, 0.0)) / reach;
  return exp(-outside * outside * 2.2);
}
`;

const PARTICLE_VERTEX = `precision highp float;
attribute vec4 aPos;   // place in the logo (x, y); which part: 0 the filled half, 1 the outline, 2 the integral; and which end of its trail: 1 the particle, 0 the tail
attribute vec4 aRnd;   // four numbers of its own, each from 0 to 1
uniform vec2 uRes;
uniform vec2 uCentre;   // the logo's origin, in buffer pixels from the bottom left
uniform float uUnit;    // buffer pixels to a logo unit
uniform vec2 uNow;      // progress through the chapters, and the time
uniform vec2 uThen;     // the same, a moment ago
uniform float uBack;    // how long ago that moment was, in seconds
uniform float uSpan;    // half the screen's width, in logo units
uniform float uHalf;    // half the area of a half-disc
uniform float uPour[${PAST}];   // how far the pour has gone: now, and at each step back in time
uniform float uSurface; // the height the ink stands at in the left vessel (and its depth below the axis in the right)
uniform float uSlosh;   // how much the ink's surface is still moving
uniform float uLean;    // how far the whole leans toward the heavy side
uniform float uPoint;   // the size of a point, in pixels
uniform float uPass;    // 0 the particles, 1 their trails
uniform float uStill;
varying float vAlpha;
${SHARED}
const float STEP = ${f(STEP)};
const float TRANSIT = ${f(TRANSIT)};

vec2 turn(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
float ease(float t) { return t * t * (3.0 - 2.0 * t); }

// A current: the curl of a stream function made of four drifting waves.
vec2 flow(vec2 p, float t) {
  vec2 v = cos(dot(p, vec2(1.10, 0.70)) + t * 0.23 + 0.4) * vec2(0.70, -1.10) * 0.60;
  v += cos(dot(p, vec2(-0.60, 1.50)) - t * 0.17 + 2.1) * vec2(1.50, 0.60) * 0.45;
  v += cos(dot(p, vec2(2.30, -1.10)) + t * 0.31 + 4.0) * vec2(-1.10, -2.30) * 0.22;
  v += cos(dot(p, vec2(1.90, 2.60)) - t * 0.29 + 5.3) * vec2(2.60, -1.90) * 0.14;
  return v;
}

// The integral, uncoiled: one long S from over the left vessel down into the right one.
vec2 pathAt(float u) {
  float m = 1.0 - u;
  return m * m * m * vec2(-1.12, 0.36) + 3.0 * m * m * u * vec2(-0.22, 1.02) + 3.0 * m * u * u * vec2(0.22, -1.02) + u * u * u * vec2(1.12, -0.36);
}
// A place beside the path: across it by one of the particle's own numbers.
vec2 besideAt(float u, float across) {
  vec2 a = pathAt(u);
  vec2 d = pathAt(u + 0.01) - a;
  return a + normalize(vec2(-d.y, d.x)) * across;
}

// The area of a half-disc that lies above a height.
float above(float y) {
  float d = clamp(y + DROP, -R, R);
  return R * R * acos(d / R) - d * sqrt(max(0.0, R * R - d * d));
}

// 0  The logo, breathing.
vec2 atHero(float t) {
  float amount = aPos.z < 0.5 ? 0.006 : (aPos.z < 1.5 ? 0.003 : 0.005);
  return aPos.xy + flow(aPos.xy * 1.6 + aRnd.xy, t) * amount * (1.0 - uStill);
}

// 1 and 2  The filled half's ink: in the left vessel, in the right one, or on the path between.
vec2 ink(float t, float back) {
  vec2 l = aPos.xy - vec2(LEFT, 0.0);
  float poured = uPour[0];
  // While it is full the left vessel is heaped past its own line, and nearly half of that is spilling off in the
  // current; by the time the two are level it lies calm.
  float unrest = 1.0 - smoothstep(0.08, 0.8, poured);
  float spill = step(0.56, aRnd.y);
  // The surface rocks a little while the pour runs and for a while after: only the ink near it moves.
  float rock = uSlosh * 0.028 * sin(l.x * 3.1 + t * 1.6) * exp(-abs(l.y - uSurface) / 0.14) * (1.0 - uStill);

  vec2 left = vec2(LEFT, 0.0) + l * mix(vec2(1.0), vec2(1.04, 1.24), unrest);
  left += flow(left * 0.9 + aRnd.zw * 3.0, t) * ((0.09 + 0.30 * spill) * unrest + 0.008 * (1.0 - uStill));
  left += unrest * spill * vec2(0.62 * aRnd.z - 0.14, 0.40 * aRnd.w);
  left.y += rock;

  // In the right vessel it lies as it lay in the left, turned over: what left the top lies at the bottom.
  vec2 right = vec2(RIGHT + l.x, -l.y);
  right += flow(right * 1.4 + aRnd.xy * 2.0, t) * 0.008 * (1.0 - uStill);
  right.y -= rock;

  // The pour reaches the highest ink first. This particle's turn comes when this much has gone.
  float mine = above(l.y) / uHalf;
  // How far along its journey it is: 0 in the left vessel, 1 in the right. While the pour is past its mark it
  // travels toward the right vessel, and while the pour is short of it, back toward the left; so it is followed
  // through everything the pour did in the time remembered, oldest moment first. A pour that turns back
  // mid-stream turns each particle round where it is.
  float gone = step(mine, uPour[${PAST - 1}]);
  float older = uPour[${PAST - 1}];
  for (int i = ${PAST - 2}; i >= 0; i--) {
    float newer = uPour[i];
    float span = STEP;
    if (i == 0) {
      // The last stretch ends at the moment asked about: now, or (for a trail) a little before.
      span = STEP - back;
      newer = mix(uPour[0], uPour[1], back / STEP);
    }
    float a = older - mine;
    float b = newer - mine;
    // The share of this stretch the pour spent past the mark.
    float past = a >= 0.0 && b >= 0.0 ? 1.0 : (a < 0.0 && b < 0.0 ? 0.0 : (a > 0.0 ? a / (a - b) : b / (b - a)));
    float forth = past * span / TRANSIT;
    float backward = (1.0 - past) * span / TRANSIT;
    // Whichever came first in the stretch is taken first.
    if (a >= 0.0) gone = max(0.0, min(1.0, gone + forth) - backward);
    else gone = min(1.0, max(0.0, gone - backward) + forth);
    older = newer;
  }
  // It leaves its place for the path, runs along it, and leaves the path for its place on the other side.
  float onPath = smoothstep(0.0, 0.2, gone) * (1.0 - smoothstep(0.8, 1.0, gone));
  vec2 along = besideAt(gone, (aRnd.x - 0.5) * (0.04 + 0.08 * aRnd.w));
  return mix(mix(left, right, ease(gone)), along, onPath * 0.95);
}

// 1 and 2  The vessels' lines: half the outline's grains stand on the left vessel's line, which is the right one's turned half round.
vec2 rim(float t) {
  vec2 p = aRnd.w < 0.5 ? -aPos.xy : aPos.xy;
  float unrest = 1.0 - smoothstep(0.08, 0.8, uPour[0]);
  return p + flow(p * 0.7 + 3.0, t) * (0.035 * unrest * aRnd.y + 0.003 * (1.0 - uStill));
}

// 1  The integral, still itself, a little unsettled.
vec2 glyph(float t) {
  return aPos.xy + flow(aPos.xy * 1.1 + 5.0, t) * 0.06;
}

// 2  The integral as the path. Its grains move along it only as the pour moves, and rest when it rests.
vec2 channel(float back, out float ends) {
  float poured = mix(uPour[0], uPour[1], back / STEP);
  float u = fract(aRnd.x + poured * 2.6);
  ends = 0.5 * smoothstep(0.0, 0.07, u) * smoothstep(1.0, 0.93, u);
  return besideAt(u, (aRnd.y - 0.5) * (0.05 + 0.09 * aRnd.w));
}

// 3  Inside the band.
vec2 atBounds(float t) {
  const float BAND = 0.36;
  if (aPos.z > 0.5 && aPos.z < 1.5) return vec2((aRnd.x * 2.0 - 1.0) * uSpan * 1.05, aRnd.y < 0.5 ? BAND : -BAND);
  // Each particle rides one of a dozen lanes, so the current shows as lines; the lanes rise and fall together in two swells.
  float lane = floor(aRnd.y * 12.0);
  float speed = 0.014 + 0.020 * fract(lane * 0.37 + 0.2);
  float x = (fract(aRnd.x + t * speed) * 2.0 - 1.0) * uSpan * 1.05;
  // Where it would be if nothing held it.
  float want = (lane / 11.0 * 2.0 - 1.0) * 1.35 + (aRnd.w - 0.5) * 0.16;
  want += 0.85 * sin(x * 1.7 + lane * 0.9 + t * 0.45) + 0.45 * sin(x * 4.1 - t * 0.33 + lane * 2.3);
  // The band turns it back: the harder it pushes, the nearer the edge it runs, and never past it.
  return vec2(x, BAND * 0.95 * want / sqrt(1.0 + want * want));
}

// Where this particle is, in the logo's own space, at a point in the story and a time (and, for a trail, a moment before).
vec2 place(float progress, float t, float back, out float fade) {
  float seg = floor(min(progress, 3.9999));
  float local = progress - seg;
  // Each particle sets off in its own time and arrives in its own time.
  float e = ease(clamp(local * 1.5 - 0.5 * aRnd.z, 0.0, 1.0));
  float mid = sin(PI * e);
  bool isInk = aPos.z < 0.5;
  bool isLine = aPos.z > 0.5 && aPos.z < 1.5;
  vec2 a;
  vec2 b;
  float swirl;
  float ends = 1.0;
  fade = 1.0;
  if (seg < 0.5) {
    a = atHero(t);
    b = turn(isInk ? ink(t, back) : (isLine ? rim(t) : glyph(t)), uLean);
    swirl = 0.16;
  } else if (seg < 1.5) {
    // The vessels are the same in both pictures: only the integral changes, from itself into the path.
    if (isInk) { a = ink(t, back); b = a; swirl = 0.02; }
    else if (isLine) { a = rim(t); b = a; swirl = 0.02; }
    else { a = glyph(t); b = channel(back, ends); swirl = 0.07; fade = mix(1.0, ends, e); }
    a = turn(a, uLean);
    b = turn(b, uLean);
  } else if (seg < 2.5) {
    a = turn(isInk ? ink(t, back) : (isLine ? rim(t) : channel(back, ends)), uLean);
    b = atBounds(t);
    swirl = 0.16;
    fade = mix(ends, 1.0, e);
  } else {
    a = atBounds(t); b = aPos.xy; swirl = 0.20;
  }
  vec2 p = mix(a, b, e);
  return p + flow(p * 0.8 + aRnd.xy * 2.0, t) * swirl * mid * (1.0 - uStill);
}

void main() {
  float fade;
  vec2 p = place(uNow.x, uNow.y, 0.0, fade);
  float part = aPos.z < 0.5 ? 0.86 : (aPos.z < 1.5 ? 0.95 : 0.90);
  float alpha = part * fade;
  if (uPass > 0.5) {
    // A trail: from where the particle was a moment ago to where it is, measured in the logo's own space, so the
    // page scrolling the logo past does not count as movement.
    float fadeThen;
    vec2 moved = p - place(uThen.x, uThen.y, uBack, fadeThen);
    float far = length(moved);
    if (far > ${f(TRAIL_MAX)}) moved *= ${f(TRAIL_MAX)} / far;
    // Too slow to see, no trail; and none across the jump where a lane or the path wraps round.
    alpha *= 0.36 * smoothstep(0.004, 0.022, far) * step(far, 0.6) * min(fade, fadeThen) * aPos.w;
    p -= moved * (1.0 - aPos.w);
  }
  vec2 at = uCentre + p * uUnit;
  float quiet = 0.0;
  for (int k = 0; k < 4; k++) quiet = max(quiet, quietAt(at, uQuiet[k], uReach));
  vAlpha = alpha * (1.0 - 0.94 * quiet);
  gl_Position = vec4(at / uRes * 2.0 - 1.0, 0.0, 1.0);
  bool outline = aPos.z > 0.5 && aPos.z < 1.5;
  gl_PointSize = uPoint * (outline ? 0.78 : (aPos.z > 1.5 ? 0.92 : 1.0));
}
`;

// The same precision as the vertex shader: they share uniforms, and a mismatch will not link.
const PARTICLE_FRAGMENT = `precision highp float;
uniform vec3 uInk;
uniform float uPass;
varying float vAlpha;
void main() {
  float a = vAlpha;
  if (uPass < 0.5) a *= 1.0 - smoothstep(0.5, 1.0, length(gl_PointCoord - 0.5) * 2.0);
  gl_FragColor = vec4(uInk * a, a);
}
`;

const QUAD_VERTEX = `attribute vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }
`;

const GROUND_FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform vec2 uCentre;
uniform float uUnit;
uniform float uSolid;     // how much of the logo's solid parts shows: the left half filled, and the integral
uniform vec2 uLines;      // how much of each half's line shows: the left one (only while the halves are vessels), the right one
uniform float uLean;      // how far the halves lean
uniform float uStroke;    // the least width of the outline, in pixels
uniform vec3 uInk;
uniform vec3 uGround;
uniform sampler2D uGlyph;
uniform vec4 uGlyphBox;   // the corners, in logo units, of what the integral's field covers
uniform float uSpread;
${SHARED}
// The outlined half as a line: its arc below the axis, and the axis itself along its top. Negative inside the line.
float halfLine(vec2 p, float half_w) {
  float arc = max(abs(length(p - vec2(RIGHT, DROP)) - R) - half_w, p.y - half_w);
  float axis = max(abs(p.y) - half_w, max(GAP - p.x, p.x - (GAP + 2.0)));
  return min(arc, axis);
}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - uCentre) / uUnit;
  float px = 1.0 / uUnit;
  float edge = px * 0.75;
  float half_w = max(${f(STROKE)} * 0.5, uStroke * 0.5 * px);
  float logo = 0.0;
  if (uSolid > 0.002) {
    // The filled half: inside its circle, and above the axis.
    float dome = max(length(p - vec2(LEFT, -DROP)) - R, -p.y);
    float whole = 1.0 - smoothstep(-edge, edge, dome);
    // The integral.
    vec2 uv = (p - uGlyphBox.xy) / (uGlyphBox.zw - uGlyphBox.xy);
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      float inside = (texture2D(uGlyph, uv).r - 0.5) * 2.0 * uSpread;
      whole = max(whole, smoothstep(-edge, edge, inside));
    }
    logo = whole * uSolid;
  }
  if (uLines.x + uLines.y > 0.002) {
    // The right half's line, and the same line turned half round for the left; both lean as the ink in them does.
    float c = cos(uLean), s = sin(uLean);
    vec2 v = vec2(c * p.x + s * p.y, c * p.y - s * p.x);
    float left = (1.0 - smoothstep(-edge, edge, halfLine(-v, half_w))) * uLines.x;
    float right = (1.0 - smoothstep(-edge, edge, halfLine(v, half_w))) * uLines.y;
    logo = max(logo, max(left, right));
  }
  float cover = 0.0;
  if (logo > 0.0) {
    float quiet = 0.0;
    for (int k = 0; k < 4; k++) quiet = max(quiet, quietAt(frag, uQuiet[k], uReach));
    cover = logo * (1.0 - 0.94 * quiet);
  }
  gl_FragColor = vec4(mix(uGround, uInk, cover), 1.0);
}
`;

// The last thing drawn: the ground color laid back over each block of text, feathered at its edges. Dimming each
// particle is not enough where many overlap; this bounds what can show through behind text, whatever is there.
const VEIL_FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform vec3 uGround;
${SHARED}
void main() {
  float quiet = 0.0;
  for (int k = 0; k < 4; k++) quiet = max(quiet, quietAt(gl_FragCoord.xy, uQuiet[k], uReach));
  float a = 0.93 * quiet;
  gl_FragColor = vec4(uGround * a, a);
}
`;

const PARTICLE_UNIFORMS = [
  "uRes", "uCentre", "uUnit", "uNow", "uThen", "uBack", "uSpan", "uHalf", "uPour", "uSurface", "uSlosh", "uLean", "uPoint", "uPass", "uStill", "uQuiet", "uReach", "uInk",
] as const;
const GROUND_UNIFORMS = ["uRes", "uCentre", "uUnit", "uSolid", "uLines", "uLean", "uStroke", "uInk", "uGround", "uGlyph", "uGlyphBox", "uSpread", "uQuiet", "uReach"] as const;

const NOWHERE = [-1e5, -1e5, -1e5, -1e5];

/** A small seeded generator, so the particles are the same on every visit. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The height in a half-disc below which half its area lies. */
function halfLevel(): number {
  const width = (y: number) => 2 * Math.sqrt(Math.max(0, R * R - (y + DROP) * (y + DROP)));
  const below = (level: number) => {
    let area = 0;
    for (let i = 0; i < 400; i++) area += width(((i + 0.5) / 400) * level) * (level / 400);
    return area;
  };
  const whole = below(HEIGHT);
  let low = 0;
  let high = HEIGHT;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (below(mid) < whole / 2) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** The area of a half-disc that lies above a height (the same arithmetic as the shader's). */
function areaAbove(y: number): number {
  const d = Math.max(-R, Math.min(R, y + DROP));
  return R * R * Math.acos(d / R) - d * Math.sqrt(Math.max(0, R * R - d * d));
}

/** The height above which that much of a half-disc lies. */
function heightFor(area: number): number {
  let low = 0;
  let high = HEIGHT;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (areaAbove(mid) > area) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Every particle's place in the logo and four numbers of its own, stored
 * twice: once as the tail of its trail, once as the particle itself.
 */
function scatter(count: number, field: LogoField) {
  const next = random(20261011);
  // The texels inside the integral: where its particles may be put.
  const cells: number[] = [];
  for (let i = 0; i < field.bytes.length; i++) if (field.bytes[i] > 127) cells.push(i);
  const data = new Float32Array(count * 16);
  const arcSpan = Math.PI - 2 * Math.asin(DROP / R);
  const arcLength = R * arcSpan;
  for (let i = 0; i < count; i++) {
    const which = next();
    let x = 0;
    let y = 0;
    let part = 0;
    if (which < 0.64) {
      // Anywhere in the filled half, evenly.
      do {
        x = next() * 2 - 1;
        y = next() * HEIGHT;
      } while (x * x + (y + DROP) * (y + DROP) > R * R);
      x += LEFT;
    } else if (which < 0.79) {
      part = 1;
      // Along the outline: the arc, or the axis across its top, in proportion to their lengths.
      if (next() < arcLength / (arcLength + 2)) {
        const angle = Math.PI + Math.asin(DROP / R) + next() * arcSpan;
        x = RIGHT + R * Math.cos(angle);
        y = DROP + R * Math.sin(angle);
      } else {
        x = GAP + next() * 2;
        y = 0;
      }
    } else {
      part = 2;
      const cell = cells[Math.min(cells.length - 1, Math.floor(next() * cells.length))];
      x = ((cell % field.width) + next()) / FIELD.perUnit - FIELD.x;
      y = (Math.floor(cell / field.width) + next()) / FIELD.perUnit - FIELD.y;
    }
    const own = [next(), next(), next(), next()];
    data.set([x, y, part, 0, ...own, x, y, part, 1, ...own], i * 16);
  }
  return data;
}

type Anchor = { x: number; y: number; unit: number };

/** Where the logo's origin sits and how large a logo unit is, for a picture with no stage of its own, in CSS pixels. */
function ownAnchor(picture: number, width: number, height: number): Anchor {
  if (width < 820) {
    const unit = Math.min(width * 0.205, height * 0.2);
    return { x: width / 2, y: height * (picture === 3 ? 0.3 : 0.27), unit };
  }
  const unit = Math.min(width * 0.108, height * 0.26);
  const places: Array<[number, number, number]> = [
    [0.745, 0.5, 1],
    [0.3, 0.5, 1],
    [0.67, 0.52, 1.04],
    [0.5, 0.68, 1],
    [0.5, 0.25, 0.9],
  ];
  const [x, y, k] = places[picture];
  return { x: width * x, y: height * y, unit: unit * k };
}

/** The logo fitted into a stage box, centred. */
function stageAnchor(stage: Stage): Anchor {
  const width = stage[2] - stage[0];
  const height = stage[3] - stage[1];
  return { x: (stage[0] + stage[2]) / 2, y: (stage[1] + stage[3]) / 2, unit: Math.max(1, Math.min(width / FIT.width, height / FIT.height)) };
}

export function logoScene(field: LogoField): ConceptDef {
  return {
    id: "logo",
    name: "Logo",
    stillTime: 6,
    stillsFollowScroll: true,
    create(gl, env) {
      const count = env.coarse ? 26000 : 64000;

      const points = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, points);
      gl.bufferData(gl.ARRAY_BUFFER, scatter(count, field), gl.STATIC_DRAW);

      const particles = compile(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
      const pu = uniforms(gl, particles, PARTICLE_UNIFORMS);
      const aPos = gl.getAttribLocation(particles, "aPos");
      const aRnd = gl.getAttribLocation(particles, "aRnd");

      const ground = compile(gl, QUAD_VERTEX, GROUND_FRAGMENT);
      const gu = uniforms(gl, ground, GROUND_UNIFORMS);
      const groundCorner = gl.getAttribLocation(ground, "aCorner");
      const veil = compile(gl, QUAD_VERTEX, VEIL_FRAGMENT);
      const vu = uniforms(gl, veil, ["uRes", "uGround", "uQuiet", "uReach"] as const);
      const veilCorner = gl.getAttribLocation(veil, "aCorner");
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      const glyph = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, glyph);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, field.width, field.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, field.bytes);
      for (const [name, value] of [
        [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
        [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
        [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      ] as const) {
        gl.texParameteri(gl.TEXTURE_2D, name, value);
      }

      const half = areaAbove(halfLevel());
      const quiet = new Float32Array(16);
      // The pour: how far it has gone and how fast it is going, what it was over the last moments (newest last),
      // the same set out at even steps for the shader, and how much the ink's surface is still moving.
      let poured: number | null = null;
      let pouring = 0;
      let slosh = 0;
      const pours: Array<[number, number]> = [];
      const steps = new Float32Array(PAST);
      // The story's place, eased: a quick flick of the wheel still arrives smoothly.
      let progress: number | null = null;
      // Where on the screen the picture is drawn, eased the same way and for one more reason: the room the page
      // leaves can itself shift (a phone's toolbar sliding away, a font arriving), and the logo should not jump.
      let spot: Anchor | null = null;
      // Where the story and the clock stood over the last few frames, for the trails.
      const past: Array<[number, number]> = [];

      return {
        detail: () => `${count.toLocaleString("en-US")} particles`,
        draw(frame: Frame) {
          // At rest there is one picture to a chapter, and nothing between.
          const place = Math.max(0, Math.min(4, frame.still ? Math.round(frame.chapter) : frame.chapter));
          if (frame.still || progress === null) {
            progress = place;
          } else {
            progress += (place - progress) * (1 - Math.exp(-frame.dt * 5));
            if (Math.abs(place - progress) < 0.0004) progress = place;
          }

          // How far the pour should have gone, by the page: nothing while the logo is whole, a little by the drift,
          // all of it by the return. And while the example portfolio drifts, in the chapter where it levels, back to
          // a little: the ink returns the way it came.
          const near = (edge0: number, edge1: number) => {
            const t = Math.max(0, Math.min(1, (place - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
          };
          const byPage = POUR_AT_DRIFT * near(0.4, 1) + (1 - POUR_AT_DRIFT) * near(1.35, 2);
          const drifting = frame.drift * near(1.2, 1.6) * (1 - near(2.4, 2.8));
          const due = byPage + (POUR_AT_DRIFT - byPage) * (frame.still ? Math.round(drifting) : drifting);
          if (frame.still || poured === null) {
            // Standing still, it is simply there: nothing is on the path.
            poured = due;
            pouring = 0;
            slosh = 0;
            pours.length = 0;
          } else {
            // It follows over a few seconds, setting off gently and arriving gently, however far it has to go.
            pouring += (POUR_PACE * POUR_PACE * (due - poured) - 2 * POUR_PACE * pouring) * frame.dt;
            poured = Math.max(0, Math.min(1, poured + pouring * frame.dt));
            if (Math.abs(due - poured) < 0.0002 && Math.abs(pouring) < 0.0002) {
              poured = due;
              pouring = 0;
            }
            // The surface moves with the pour, and goes on moving for a little while after it.
            const astir = Math.min(1, Math.abs(pouring) * 4);
            slosh += (astir - slosh) * (1 - Math.exp(-frame.dt * (astir > slosh ? 3 : 0.7)));
          }
          // What the pour was at each step back in time, from what is remembered of it.
          pours.push([frame.time, poured]);
          while (pours.length > 2 && frame.time - pours[1][0] > PAST * STEP) pours.shift();
          for (let k = 0, i = pours.length - 1; k < PAST; k++) {
            const when = frame.time - k * STEP;
            while (i > 0 && pours[i - 1][0] >= when) i--;
            const [t1, q1] = pours[i];
            const [t0, q0] = pours[Math.max(0, i - 1)];
            steps[k] = when >= t1 || t1 === t0 ? q1 : when <= t0 ? q0 : q0 + ((q1 - q0) * (when - t0)) / (t1 - t0);
          }
          // The whole leans to the heavy side while it is out of balance, and comes level as the ink does.
          const settle = (edge0: number, edge1: number, value: number) => {
            const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
          };
          const lean = LEAN * settle(0.1, 1, progress) * (1 - settle(POUR_AT_DRIFT, 0.95, poured)) * (1 - settle(2, 3, progress));

          // The moment a trail reaches back to: the oldest remembered one still inside the trail's span.
          let then: [number, number] = [progress, frame.time];
          if (frame.still) past.length = 0;
          else {
            while (past.length > 0 && frame.time - past[0][1] > TRAIL_SECONDS) past.shift();
            if (past.length > 0) then = past[0];
            past.push([progress, frame.time]);
            if (past.length > 40) past.shift();
          }

          const [width, height] = frame.buffer;
          // Where it is drawn follows the page alone: between two chapters, between their two places.
          const from = Math.min(3, Math.floor(place));
          const local = place - from;
          const blend = local * local * (3 - 2 * local);
          const anchor = (picture: number) => {
            const stage = frame.stages[picture];
            return stage ? stageAnchor(stage) : ownAnchor(picture, frame.css[0], frame.css[1]);
          };
          const a = anchor(from);
          const b = anchor(from + 1);
          const wanted: Anchor = { x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend, unit: a.unit + (b.unit - a.unit) * blend };
          if (frame.still || spot === null) {
            spot = wanted;
          } else {
            const follow = 1 - Math.exp(-frame.dt * 7);
            spot = {
              x: spot.x + (wanted.x - spot.x) * follow,
              y: spot.y + (wanted.y - spot.y) * follow,
              unit: spot.unit + (wanted.unit - spot.unit) * follow,
            };
            if (Math.abs(wanted.x - spot.x) + Math.abs(wanted.y - spot.y) < 0.05) spot = wanted;
          }
          // A slow swell in the size of the whole logo while it is whole: breathing.
          const breath = frame.still ? 1 : 1 + 0.006 * Math.sin(frame.time * 0.7) * Math.max(0, 1 - progress * 4);
          const unit = spot.unit * frame.scale * breath;
          const centreX = spot.x * frame.scale;
          const centreY = (frame.css[1] - spot.y) * frame.scale;
          // The band runs the whole width of the screen, however far to one side the logo sits.
          const span = Math.max(centreX, width - centreX) / unit;
          // The logo's solid parts show while the particles are in them: at the top of the page, and again at the
          // end. Between, the halves are vessels: the left one takes the right one's line, as its solid fades.
          const solid = Math.max(1 - settle(0.03, 0.3, progress), settle(3.7, 3.97, progress));
          const vessels = 1 - solid;

          const mix = (light: number[], dark: number[]) => light.map((value, i) => (value + (dark[i] - value) * frame.dark) / 255);
          const inkColor = mix(LIGHT.ink, DARK.ink);
          const groundColor = mix(LIGHT.ground, DARK.ground);

          for (let k = 0; k < 4; k++) {
            const zone = frame.quiet[k];
            quiet.set(
              zone
                ? [zone[0] * frame.scale, (frame.css[1] - zone[3]) * frame.scale, zone[2] * frame.scale, (frame.css[1] - zone[1]) * frame.scale]
                : NOWHERE,
              k * 4,
            );
          }
          // Fewer particles when the frame rate has asked for less.
          const shown = Math.max(1, Math.round(count * (0.55 + 0.45 * ((frame.quality - 0.5) / 0.5))));

          // 1. The ground and the exact logo.
          gl.disable(gl.BLEND);
          gl.useProgram(ground);
          gl.bindBuffer(gl.ARRAY_BUFFER, quad);
          gl.enableVertexAttribArray(groundCorner);
          gl.vertexAttribPointer(groundCorner, 2, gl.FLOAT, false, 0, 0);
          gl.uniform2f(gu.uRes, width, height);
          gl.uniform2f(gu.uCentre, centreX, centreY);
          gl.uniform1f(gu.uUnit, unit);
          gl.uniform1f(gu.uSolid, solid);
          gl.uniform2f(gu.uLines, vessels, 1);
          gl.uniform1f(gu.uLean, lean);
          gl.uniform1f(gu.uStroke, 1.15 * frame.scale);
          gl.uniform3f(gu.uInk, inkColor[0], inkColor[1], inkColor[2]);
          gl.uniform3f(gu.uGround, groundColor[0], groundColor[1], groundColor[2]);
          gl.uniform4f(gu.uGlyphBox, -FIELD.x, -FIELD.y, FIELD.x, FIELD.y);
          gl.uniform1f(gu.uSpread, FIELD.spread);
          gl.uniform4fv(gu.uQuiet, quiet);
          gl.uniform1f(gu.uReach, DIM_REACH * frame.scale);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, glyph);
          gl.uniform1i(gu.uGlyph, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.disableVertexAttribArray(groundCorner);

          // 2. The particles, and the trails of those that are moving.
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(particles);
          gl.bindBuffer(gl.ARRAY_BUFFER, points);
          gl.enableVertexAttribArray(aPos);
          gl.enableVertexAttribArray(aRnd);
          gl.uniform2f(pu.uRes, width, height);
          gl.uniform2f(pu.uCentre, centreX, centreY);
          gl.uniform1f(pu.uUnit, unit);
          gl.uniform2f(pu.uNow, progress, frame.time);
          gl.uniform2f(pu.uThen, then[0], then[1]);
          gl.uniform1f(pu.uBack, frame.time - then[1]);
          gl.uniform1f(pu.uSpan, span);
          gl.uniform1f(pu.uHalf, half);
          gl.uniform1fv(pu.uPour, steps);
          gl.uniform1f(pu.uSurface, heightFor(poured * half));
          gl.uniform1f(pu.uSlosh, slosh);
          gl.uniform1f(pu.uLean, lean);
          gl.uniform1f(pu.uPoint, Math.max(1.5 * frame.scale, Math.min(3 * frame.scale, unit * 0.0125)));
          gl.uniform1f(pu.uStill, frame.still ? 1 : 0);
          gl.uniform4fv(pu.uQuiet, quiet);
          gl.uniform1f(pu.uReach, DIM_REACH * frame.scale);
          gl.uniform3f(pu.uInk, inkColor[0], inkColor[1], inkColor[2]);
          // Nothing moves far enough to leave a trail while the logo is whole and still, so that pass is skipped there.
          const moving = !frame.still && (then[0] !== progress || (progress > 0.02 && progress < 3.98));
          if (moving) {
            gl.vertexAttribPointer(aPos, 4, gl.FLOAT, false, 32, 0);
            gl.vertexAttribPointer(aRnd, 4, gl.FLOAT, false, 32, 16);
            gl.uniform1f(pu.uPass, 1);
            gl.drawArrays(gl.LINES, 0, shown * 2);
          }
          // The particles themselves: every second vertex, read with a doubled stride.
          gl.vertexAttribPointer(aPos, 4, gl.FLOAT, false, 64, 32);
          gl.vertexAttribPointer(aRnd, 4, gl.FLOAT, false, 64, 48);
          gl.uniform1f(pu.uPass, 0);
          gl.drawArrays(gl.POINTS, 0, shown);
          gl.disableVertexAttribArray(aPos);
          gl.disableVertexAttribArray(aRnd);

          // 3. The veil behind text.
          if (frame.quiet.length > 0) {
            gl.useProgram(veil);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(veilCorner);
            gl.vertexAttribPointer(veilCorner, 2, gl.FLOAT, false, 0, 0);
            gl.uniform2f(vu.uRes, width, height);
            gl.uniform3f(vu.uGround, groundColor[0], groundColor[1], groundColor[2]);
            gl.uniform4fv(vu.uQuiet, quiet);
            gl.uniform1f(vu.uReach, VEIL_REACH * frame.scale);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.disableVertexAttribArray(veilCorner);
          }
        },
        dispose() {
          gl.deleteBuffer(points);
          gl.deleteBuffer(quad);
          gl.deleteTexture(glyph);
          gl.deleteProgram(particles);
          gl.deleteProgram(ground);
          gl.deleteProgram(veil);
        },
      };
    },
  };
}
