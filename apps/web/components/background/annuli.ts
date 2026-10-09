import { compile, derivativesHeader, uniforms, type ConceptDef, type Frame } from "./engine";

/*
  Annuli: Otolith's background.

  An otolith grows by laying down rings, and this is that: growth rings
  spreading from a nucleus, in three layers at different depths, with
  particles travelling along the nearest layer. Balanced, every particle
  rides its ring. Drifting, the layers buckle and warm, and the particles
  are carried off their rings, each still held to its place by a thread.
  A rebalance sends one bright ring out from the nucleus; behind it every
  particle is back on its ring.

  The scene changes with the chapter of the page in view: the nucleus
  moves, the rings tighten or open, the accent shifts. Behind a block of
  text it goes quiet, dimming itself rather than relying on a panel drawn
  over it.

  Two draw passes, no post-processing: the rings are one fragment shader
  over the screen (the glow is computed from each line's own distance, not
  blurred afterwards), and the particles are points and line segments
  placed on the GPU from the same ring equation.
*/

/** What a chapter of the page asks of the scene. */
type Scene = {
  /** The nucleus, from the center of the screen: x in screen widths, y in screen heights (up). */
  nucleus: [number, number];
  /** Rings per screen height. */
  density: number;
  /** The cool accent for this chapter; it warms toward the drift color on its own. */
  accent: [number, number, number];
};

// One entry per chapter of the landing page, in order. The scene eases
// from one to the next as the page scrolls.
export const CHAPTERS: Scene[] = [
  { nucleus: [0.34, -0.66], density: 30, accent: [0.5, 0.46, 1.0] },
  { nucleus: [-0.4, -0.58], density: 24, accent: [0.4, 0.56, 1.0] },
  { nucleus: [0.27, -0.06], density: 38, accent: [0.34, 0.74, 0.96] },
  { nucleus: [-0.05, 0.7], density: 46, accent: [0.66, 0.78, 1.0] },
  { nucleus: [0.0, -0.08], density: 21, accent: [0.56, 0.48, 1.0] },
];

function sceneAt(chapter: number): Scene {
  const at = Math.max(0, Math.min(CHAPTERS.length - 1, chapter));
  const from = CHAPTERS[Math.floor(at)];
  const to = CHAPTERS[Math.min(CHAPTERS.length - 1, Math.floor(at) + 1)];
  const f = at - Math.floor(at);
  const k = f * f * (3 - 2 * f);
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    nucleus: [mix(from.nucleus[0], to.nucleus[0]), mix(from.nucleus[1], to.nucleus[1])],
    density: mix(from.density, to.density),
    accent: [mix(from.accent[0], to.accent[0]), mix(from.accent[1], to.accent[1]), mix(from.accent[2], to.accent[2])],
  };
}

// Provisional palette: a deep ground, a pearl ink, and the warm tone a
// drifting field takes on.
const PALETTE = `
const vec3 GROUND = vec3(0.022, 0.026, 0.048);
const vec3 PEARL = vec3(0.86, 0.88, 0.98);
const vec3 WARM = vec3(1.00, 0.47, 0.44);
`;

// The ring equation, shared by both passes so the particles sit exactly
// on the lines the fragment shader draws.
const RINGS = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum;
}
// An otolith is not round: two shallow lobes, from the direction alone (no seam).
float shapeOf(vec2 dir) {
  float s2 = 2.0 * dir.x * dir.y;
  float c2 = dir.x * dir.x - dir.y * dir.y;
  float s3 = 3.0 * dir.y - 4.0 * dir.y * dir.y * dir.y;
  float c3 = 4.0 * dir.x * dir.x * dir.x - 3.0 * dir.x;
  return 1.0 + 0.07 * (s2 * 0.765 + c2 * 0.644) + 0.03 * (s3 * 0.454 - c3 * 0.891);
}
// The unevenness of the layers, which grows when the field drifts.
float grainOf(vec2 dir, float radius, float time, float seed) {
  return fbm(dir * 1.7 + vec2(radius * 2.4 - time * 0.04, radius * 1.3 + seed));
}
// How quiet the field should be at a point, for one block of text: fully
// quiet over the block itself, then falling away like a bell over a wide
// reach, so there is no edge to see, only the field settling down.
float quietAt(vec2 at, vec4 box, float reach) {
  vec2 d = max(box.xy - at, at - box.zw);
  float outside = length(max(d, 0.0)) / reach;
  return exp(-outside * outside * 2.2);
}
`;

const RING_FRAGMENT = `
uniform vec2 uRes;
uniform float uTime;
uniform float uGrowth;
uniform vec3 uPointer;
uniform float uDrift;
uniform float uPulse;
uniform vec2 uNucleus;
uniform float uDensity;
uniform vec3 uAccent;
uniform vec4 uQuiet[4];
uniform float uCalm;
uniform float uGrain;
${PALETTE}${RINGS}
float pixel(float value, float fallback) {
#ifdef HAS_DERIVATIVES
  return fwidth(value);
#else
  return fallback;
#endif
}
void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((gl_FragCoord.x / uRes.x - 0.5) * aspect, gl_FragCoord.y / uRes.y - 0.5);
  vec2 m = vec2((uPointer.x / uRes.x - 0.5) * aspect, uPointer.y / uRes.y - 0.5);
  vec2 nucleus = vec2(uNucleus.x * aspect, uNucleus.y);
  // Behind the app the field is too dim for brightness to say anything, so
  // drift is told by hue there: the rings go fully warm, not partly.
  float warmth = uDrift * mix(0.65, 1.0, uCalm);
  vec3 accent = mix(uAccent, WARM, warmth);

  // The pointer presses the nearest layer apart around it.
  vec2 d = p - m;
  float lens = uPointer.z * exp(-dot(d, d) / 0.03);

  vec3 color = GROUND + accent * 0.045 * smoothstep(1.5, 0.0, length(p - nucleus));

  // Three layers, far to near. A far layer is denser, dimmer, softer and
  // more tinted, turns a little, and moves less with the page and pointer.
  for (int i = 0; i < 3; i++) {
    float depth = 1.0 - float(i) * 0.5;
    vec2 c = nucleus * (1.0 - 0.22 * depth) + depth * vec2(0.05, -0.07) - m * 0.045 * (1.0 - depth) * uPointer.z;
    vec2 q = p - c;
    if (i == 2) q += d * lens * 0.42;
    float turn = depth * 0.9;
    q = vec2(cos(turn) * q.x - sin(turn) * q.y, sin(turn) * q.x + cos(turn) * q.y);

    float r = length(q);
    vec2 dir = q / max(r, 1e-4);
    float radius = r * shapeOf(dir);
    float grain = grainOf(dir, radius, uTime, depth * 7.3);
    radius += (0.010 + 0.055 * uDrift) * (1.0 - 0.5 * depth) * (grain - 0.5);

    float N = uDensity * (1.0 + 0.35 * depth);
    float x = radius * N;
    float u = x + 0.7 * sin(x * 0.31) - (uGrowth * (1.0 - 0.45 * depth) + depth * 13.7);
    float heavy = step(0.80, hash(vec2(floor(u), 3.0 + depth)));
    float px = pixel(u, N / uRes.y * 1.4) * (1.0 + 2.2 * depth);
    float g = abs(fract(u) - 0.5);
    float line = 1.0 - smoothstep(px * (0.6 + heavy), px * (1.8 + heavy * 1.6), g);
    // The glow: a halo around the heavier rings, from the same distance the line is drawn from.
    float halo = heavy * pow(1.0 - smoothstep(0.0, 0.36, g), 3.0);

    float fade = smoothstep(2.3, 0.12, radius) * (1.0 - 0.72 * depth) * (0.6 + 0.4 * grain);
    vec3 ink = mix(PEARL, mix(accent, uAccent, 0.6 * depth * (1.0 - uCalm * uDrift)), 0.20 + (0.28 + 0.36 * uCalm) * uDrift + 0.42 * depth);
    color += ink * line * (0.14 + 0.30 * heavy + (i == 2 ? 0.55 * lens : 0.0)) * fade;
    color += accent * halo * 0.07 * fade;

    if (i == 2) {
      // A rebalance: one bright ring, with its own soft halo, crossing the layers.
      float front = uPulse * 0.7;
      float live = exp(-uPulse * 0.8) * step(uPulse, 8.0);
      color += accent * exp(-pow((radius - front) / 0.05, 2.0)) * live * (0.22 + 0.90 * line);
      color += accent * exp(-pow((radius - front) / 0.17, 2.0)) * live * 0.11;
      // The nucleus itself, when a chapter brings it on screen.
      color += accent * 0.20 * exp(-radius * radius / 0.012) + PEARL * 0.55 * exp(-radius * radius / 0.0005);
    }
  }

  // Behind an app's data the whole field is subdued.
  color = GROUND + (color - GROUND) * (1.0 - 0.58 * uCalm);

  // Quiet behind text. Dimmed, and capped: even the nucleus or a pulse
  // passing behind text stays dark enough to read over.
  float quiet = 0.0;
  for (int k = 0; k < 4; k++) quiet = max(quiet, quietAt(gl_FragCoord.xy, uQuiet[k], uRes.y * mix(0.24, 0.10, uCalm)));
  color = mix(color, GROUND + min((color - GROUND) * mix(0.14, 0.07, uCalm), vec3(mix(0.075, 0.045, uCalm))), quiet);

  vec2 v = (gl_FragCoord.xy / uRes - 0.5) * 2.0;
  color *= 1.0 - 0.36 * pow(dot(v, v) * 0.5, 1.5);
  color += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.026 * uGrain;
  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
`;

const QUAD_VERTEX = `
attribute vec2 aCorner;
void main() {
  gl_Position = vec4(aCorner, 0.0, 1.0);
}
`;

// How many rings the particles are spread across before they wrap.
const RING_SPAN = 64;

const PARTICLE_VERTEX = `
attribute float aRing;
attribute float aAngle;
attribute float aSeed;
attribute float aEnd;
uniform vec2 uRes;
uniform float uScale;
uniform float uTime;
uniform float uGrowth;
uniform vec3 uPointer;
uniform float uDrift;
uniform float uHeld;
uniform float uPulse;
uniform vec2 uNucleus;
uniform float uDensity;
uniform vec4 uQuiet[4];
uniform float uCalm;
uniform float uPass;
varying float vOut;
varying float vEnd;
varying float vGlow;
varying float vAlpha;
${RINGS}
void main() {
  float aspect = uRes.x / uRes.y;
  vec2 m = vec2((uPointer.x / uRes.x - 0.5) * aspect, uPointer.y / uRes.y - 0.5);
  vec2 c = vec2(uNucleus.x * aspect, uNucleus.y) - m * 0.045 * uPointer.z;

  // Which ring, and where on it. The ring equation is solved for its radius.
  float target = mod(aRing + 0.5 + uGrowth, ${RING_SPAN}.0);
  float x = target - 0.7 * sin(0.31 * target);
  x -= (x + 0.7 * sin(0.31 * x) - target) / (1.0 + 0.217 * cos(0.31 * x));
  float way = mod(aRing, 2.0) < 1.0 ? 1.0 : -1.0;
  float a = aAngle + uTime * way * (0.5 + aSeed) * 0.035;
  vec2 dir = vec2(cos(a), sin(a));
  float radius = x / uDensity;
  float onRing = radius - (0.010 + 0.055 * uDrift) * (grainOf(dir, radius, uTime, 0.0) - 0.5);
  vec2 anchor = c + dir * (onRing / shapeOf(dir));
  vec2 d = anchor - m;
  anchor -= d * uPointer.z * exp(-dot(d, d) / 0.03) * 0.42;

  // The rebalance front: ahead of it the field is as it was; behind it, as it now is.
  float front = uPulse * 0.7;
  float behind = smoothstep(front, front - 0.16, radius) * step(uPulse, 8.0) + step(8.0, uPulse);
  float drift = mix(uHeld, uDrift, behind);

  // Drift carries a particle off its ring, mostly across it.
  vec2 wander = vec2(vnoise(vec2(aSeed * 40.0, uTime * 0.11)), vnoise(vec2(uTime * 0.09, aSeed * 31.0 + 5.0))) - 0.5;
  vec2 offset = (dir * wander.x * 2.2 + vec2(-dir.y, dir.x) * wander.y * 0.8) * (0.002 + drift * 0.055);
  float band = 0.014;
  vOut = clamp((length(offset) - band) / band, 0.0, 1.0);
  vEnd = aEnd;
  vGlow = exp(-pow((radius - front) / 0.06, 2.0)) * exp(-uPulse * 0.8) * step(uPulse, 8.0);

  vec2 position = anchor + offset * aEnd;
  vec2 pixelAt = (position / vec2(aspect, 1.0) + 0.5) * uRes;
  float quiet = 0.0;
  for (int k = 0; k < 4; k++) quiet = max(quiet, quietAt(pixelAt, uQuiet[k], uRes.y * mix(0.24, 0.10, uCalm)));
  vAlpha = smoothstep(0.05, 0.16, radius) * smoothstep(2.2, 1.5, radius) * (1.0 - 0.94 * quiet) * (1.0 - 0.35 * uCalm);

  gl_Position = vec4(position.x * 2.0 / aspect, position.y * 2.0, 0.0, 1.0);
  gl_PointSize = (1.6 + 1.4 * aSeed + 1.5 * vOut + 2.0 * vGlow) * uScale;
}
`;

const PARTICLE_FRAGMENT = `precision highp float;
uniform float uPass;
uniform vec3 uAccent;
varying float vOut;
varying float vEnd;
varying float vGlow;
varying float vAlpha;
${PALETTE}
void main() {
  vec3 color = mix(PEARL, WARM, vOut) * (1.0 - 0.5 * vGlow) + uAccent * vGlow * 1.2;
  float alpha;
  if (uPass < 0.5) {
    // The thread: nothing at the ring, stronger toward the particle, warmer once past the band.
    alpha = vEnd * (0.06 + 0.50 * vOut + 0.4 * vGlow);
  } else {
    float shape = smoothstep(0.5, 0.12, length(gl_PointCoord - 0.5));
    alpha = shape * (0.55 + 0.40 * vOut + vGlow);
  }
  alpha *= vAlpha;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

const RING_UNIFORMS = [
  "uRes",
  "uTime",
  "uGrowth",
  "uPointer",
  "uDrift",
  "uPulse",
  "uNucleus",
  "uDensity",
  "uAccent",
  "uQuiet",
  "uCalm",
  "uGrain",
] as const;
const PARTICLE_UNIFORMS = [
  "uRes",
  "uScale",
  "uTime",
  "uGrowth",
  "uPointer",
  "uDrift",
  "uHeld",
  "uPulse",
  "uNucleus",
  "uDensity",
  "uAccent",
  "uQuiet",
  "uCalm",
  "uPass",
] as const;

// A zone nothing is inside of, for the unused slots.
const NOWHERE = [-1e5, -1e5, -1e5, -1e5];

export const ANNULI: ConceptDef = {
  id: "annuli",
  name: "Annuli",
  stillTime: 22,
  create(gl, env) {
    const rings = compile(gl, QUAD_VERTEX, `${derivativesHeader(gl)}precision highp float;${RING_FRAGMENT}`);
    const ru = uniforms(gl, rings, RING_UNIFORMS);
    const corner = gl.getAttribLocation(rings, "aCorner");
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const particles = compile(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
    const pu = uniforms(gl, particles, PARTICLE_UNIFORMS);
    const attribs = ["aRing", "aAngle", "aSeed", "aEnd"].map((name) => gl.getAttribLocation(particles, name));
    // Fewer particles to a ring on a finger-driven, lower-powered screen.
    const perRing = env.coarse ? 8 : 12;
    const count = RING_SPAN * perRing;
    // Each particle is stored twice, once per end of its thread: the ring end, then the particle end.
    const data = new Float32Array(count * 2 * 4);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0, at = 0; i < count; i++) {
      // Dealt round the rings in turn, so drawing only the first part of the buffer thins every ring alike.
      const ring = i % RING_SPAN;
      const angle = random() * Math.PI * 2;
      const value = random();
      for (let end = 0; end < 2; end++) {
        data[at++] = ring;
        data[at++] = angle;
        data[at++] = value;
        data[at++] = end;
      }
    }
    const points = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, points);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    // How far the rings have grown: integrated here, so a change of state
    // changes their speed and never their position.
    let grown = 4;
    const quiet = new Float32Array(16);

    return {
      detail: () => `${count.toLocaleString("en-US")} particles`,
      draw(frame: Frame) {
        grown += frame.dt * (0.2 + 0.45 * frame.drift);
        // On the landing page, scrolling walks through the layers; behind an app it does not.
        const growth = grown + frame.scroll[0] * 1.5 * (1 - frame.calm);
        const scene = sceneAt(frame.chapter);
        const [width, height] = frame.buffer;
        const pointer: [number, number, number] = [
          frame.pointer[0] * frame.scale,
          (frame.css[1] - frame.pointer[1]) * frame.scale,
          frame.pointer[2],
        ];
        // Text blocks, from CSS pixels with y down to buffer pixels with y up.
        for (let k = 0; k < 4; k++) {
          const zone = frame.quiet[k];
          quiet.set(
            zone
              ? [zone[0] * frame.scale, (frame.css[1] - zone[3]) * frame.scale, zone[2] * frame.scale, (frame.css[1] - zone[1]) * frame.scale]
              : NOWHERE,
            k * 4,
          );
        }

        gl.disable(gl.BLEND);
        gl.useProgram(rings);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(corner);
        gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(ru.uRes, width, height);
        gl.uniform1f(ru.uTime, frame.time);
        gl.uniform1f(ru.uGrowth, growth);
        gl.uniform3f(ru.uPointer, pointer[0], pointer[1], pointer[2]);
        gl.uniform1f(ru.uDrift, frame.drift);
        gl.uniform1f(ru.uPulse, frame.pulse);
        gl.uniform2f(ru.uNucleus, scene.nucleus[0], scene.nucleus[1]);
        gl.uniform1f(ru.uDensity, scene.density);
        gl.uniform3f(ru.uAccent, scene.accent[0], scene.accent[1], scene.accent[2]);
        gl.uniform4fv(ru.uQuiet, quiet);
        gl.uniform1f(ru.uCalm, frame.calm);
        gl.uniform1f(ru.uGrain, frame.grain);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(corner);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(particles);
        gl.bindBuffer(gl.ARRAY_BUFFER, points);
        for (const attrib of attribs) gl.enableVertexAttribArray(attrib);
        gl.uniform2f(pu.uRes, width, height);
        gl.uniform1f(pu.uScale, frame.scale);
        gl.uniform1f(pu.uTime, frame.time);
        gl.uniform1f(pu.uGrowth, growth);
        gl.uniform3f(pu.uPointer, pointer[0], pointer[1], pointer[2]);
        gl.uniform1f(pu.uDrift, frame.drift);
        gl.uniform1f(pu.uHeld, frame.held);
        gl.uniform1f(pu.uPulse, frame.pulse);
        gl.uniform2f(pu.uNucleus, scene.nucleus[0], scene.nucleus[1]);
        gl.uniform1f(pu.uDensity, scene.density);
        gl.uniform3f(pu.uAccent, scene.accent[0], scene.accent[1], scene.accent[2]);
        gl.uniform4fv(pu.uQuiet, quiet);
        gl.uniform1f(pu.uCalm, frame.calm);
        // Behind an app's data, fewer particles.
        const shown = Math.max(1, Math.round(count * (1 - 0.6 * frame.calm)));

        // Threads: every vertex, as segments from ring to particle.
        attribs.forEach((attrib, index) => gl.vertexAttribPointer(attrib, 1, gl.FLOAT, false, 16, index * 4));
        gl.uniform1f(pu.uPass, 0);
        gl.drawArrays(gl.LINES, 0, shown * 2);
        // Particles: every second vertex, read with a doubled stride.
        attribs.forEach((attrib, index) => gl.vertexAttribPointer(attrib, 1, gl.FLOAT, false, 32, 16 + index * 4));
        gl.uniform1f(pu.uPass, 1);
        gl.drawArrays(gl.POINTS, 0, shown);
        for (const attrib of attribs) gl.disableVertexAttribArray(attrib);
      },
      dispose() {
        gl.deleteBuffer(quad);
        gl.deleteBuffer(points);
        gl.deleteProgram(rings);
        gl.deleteProgram(particles);
      },
    };
  },
};
