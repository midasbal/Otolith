/*
  The background engine: one canvas, one WebGL context, one animation
  loop.

  It owns everything the scene should not have to think about: the size
  of the drawing buffer and how it adapts to a slow GPU, when the loop
  runs and when it rests (tab hidden, canvas off screen, paused by the
  viewer, reduced motion), and the inputs the scene is driven by: time,
  the pointer, the scroll position and its speed, which chapter of the
  page is in view, where the text is (so the scene can stay quiet behind
  it), and the portfolio's state (balanced or drifting, and the moment of
  a rebalance). The scene only turns those inputs into a picture.

  Hand-written WebGL 1, no library. The canvas never takes the pointer or
  focus; the engine listens on the window instead.
*/

export type BackgroundState = "balanced" | "drifting";

/** What a concept is handed each frame. Lengths are CSS pixels unless noted. */
export type Frame = {
  /** Seconds of animation time. Stops while paused. */
  time: number;
  /** Seconds since the previous frame. */
  dt: number;
  /** The adaptive quality, from 0.5 to 1: a scene may draw less below 1. */
  quality: number;
  /** Which chapter of the page is in view, as a continuous index (1.5 is halfway from the second to the third). */
  chapter: number;
  /** Blocks of text the scene should stay quiet behind: left, top, right, bottom. */
  quiet: QuietZone[];
  /** How subdued the whole scene should be, from 0 (the landing page) to 1 (behind an app's data). */
  calm: number;
  /** Film grain, from 0 to 1. Off for an exported still. */
  grain: number;
  /** The drawing buffer, in device pixels, and the canvas, in CSS pixels. */
  buffer: [number, number];
  css: [number, number];
  /** Buffer pixels per CSS pixel, after the adaptive scale. */
  scale: number;
  /** The pointer, eased: position from the top left, and how present it is (0 to 1). */
  pointer: [number, number, number];
  /** Scroll position in viewport heights, and its eased speed in viewport heights per second. */
  scroll: [number, number];
  /** 0 when balanced, 1 when fully drifting, eased between. */
  drift: number;
  /** The drift as it was when the last rebalance began; equal to `drift` otherwise. */
  held: number;
  /** Seconds since the last rebalance pulse (large when there has been none). */
  pulse: number;
  /** Where the pulse began. */
  pulseOrigin: [number, number];
  /** A sprung tilt, in radians: leans with the pointer, scroll and drift, then settles. */
  tilt: number;
  /** True when this frame is a still: the scene is resting (paused, or less motion asked for) and no time is passing. */
  still: boolean;
  /** 0 in the light theme, 1 in the dark, eased between when the theme changes. */
  dark: number;
  /** Where the page has left room for the scene, a box to each chapter (left, top, right, bottom), where it has. */
  stages: Array<Stage | null>;
};

/** A box the page keeps clear for the scene, in CSS pixels from the top left of the viewport. */
export type Stage = [number, number, number, number];

export type QuietZone = [number, number, number, number];

/** What the page tells the engine each frame. Read-only: it must not write to the DOM. */
export type PageReading = { chapter: number; quiet: QuietZone[]; stages?: Array<Stage | null> };

export type ConceptInstance = {
  draw(frame: Frame): void;
  /** Called when the canvas changes size, before the next draw. */
  resize?(css: [number, number]): void;
  /** One line for the readout, such as a particle count. */
  detail?(): string;
  dispose(): void;
};

export type ConceptDef = {
  id: string;
  name: string;
  /** The time, in seconds, of the still frame shown under reduced motion. */
  stillTime: number;
  /** For a scene whose picture is told by the page's chapters: while it rests,
      it is redrawn for the chapter that comes into view, so each chapter has
      its own still. Without this a resting scene keeps the chapter it had. */
  stillsFollowScroll?: boolean;
  create(gl: WebGLRenderingContext, env: { coarse: boolean; css: [number, number] }): ConceptInstance;
};

export type Engine = {
  setState(state: BackgroundState): void;
  /** A rebalance was submitted: one bright ring crosses the field. It does
      not change the state; that is whatever setState last said. */
  pulse(): void;
  setPaused(paused: boolean): void;
  /** Takes the clock away from the browser, for frame-exact recording. */
  setManual(manual: boolean): void;
  /** Advances a manual clock by `dt` seconds and draws. */
  step(dt: number): void;
  /** Overrides the pointer with a scripted one (CSS pixels, and how present it is), or hands it back with null. */
  setPointer(point: [number, number] | null, presence?: number): void;
  /** How subdued the scene is, whether it carries grain, and which theme it is drawn in. */
  setLook(look: { calm?: number; grain?: number; dark?: boolean }): void;
  /** For testing the adaptive quality: pretends each frame costs this many milliseconds per million pixels drawn. */
  setSimulatedCost(msPerMegapixel: number): void;
  stats(): {
    fps: number;
    p95: number;
    worst: number;
    scale: number;
    quality: number;
    buffer: string;
    detail: string;
    running: boolean;
    /** True once the animation has given way to a still frame because the device could not keep up. */
    gaveUp: boolean;
    frames: number;
  };
  destroy(): void;
};

const MAX_SCALE_FINE = 2;
const MAX_SCALE_COARSE = 1.5;
const MIN_QUALITY = 0.5;

export function createBackground(
  canvas: HTMLCanvasElement,
  def: ConceptDef,
  options: { reducedMotion: boolean; read?: () => PageReading; onGiveUp?: () => void; dark?: boolean },
): Engine | null {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "default",
    // A software renderer cannot keep this up; better the still picture than a slideshow.
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;
  // Not every browser reports the caveat, so the renderer is asked by name as well.
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const maxScale = Math.min(window.devicePixelRatio || 1, coarse ? MAX_SCALE_COARSE : MAX_SCALE_FINE);

  let css: [number, number] = [canvas.clientWidth || 1, canvas.clientHeight || 1];
  let quality = 1;
  let instance = def.create(gl, { coarse, css });

  // Inputs, eased here so every concept sees the same calm signals.
  let time = options.reducedMotion ? def.stillTime : 0;
  let state: BackgroundState = "balanced";
  let drift = 0;
  let held = 0;
  let pulse = 1000;
  let pulseOrigin: [number, number] = [css[0] / 2, css[1] / 2];
  const pointerTarget: [number, number] = [css[0] * 0.5, css[1] * 0.45];
  const pointer: [number, number, number] = [pointerTarget[0], pointerTarget[1], 0];
  let pointerSeen = -10;
  let scripted = false;
  let scriptedPresence = 1;
  let calm = 0;
  let grain = 1;
  let darkTarget = options.dark ? 1 : 0;
  let dark = darkTarget;
  let scrollY = window.scrollY / Math.max(1, window.innerHeight);
  let scrollSpeed = 0;
  let tilt = 0;
  let tiltSpeed = 0;
  let lastDt = 0;
  let simulatedCost = 0;

  let paused = false;
  let manual = false;
  let visible = true;
  let onScreen = true;
  let lost = false;
  let raf = 0;
  let last = 0;
  let frames = 0;
  const times: number[] = [];
  let slowWindows = 0;
  let fastWindows = 0;
  let stuckWindows = 0;
  let windowSum = 0;
  let windowCount = 0;
  // Set when even the smallest buffer cannot be drawn at a usable rate:
  // the loop stops for good and the last frame stays up as a still.
  let gaveUp = false;
  // Where the buffer stood, and how slow the frames were, when it first had to shrink: what the smallest buffer is
  // measured against, to tell a slow GPU from a rate that is being held down.
  let slowFrom: { quality: number; mean: number } | null = null;
  // The frame time the scene is held at by something other than its own drawing, once that is known.
  let heldAt: number | null = null;
  // The chapter last drawn, kept while the scene rests (see handleScroll),
  // and where the quiet zones were when it was drawn.
  let chapter: number | null = null;
  let scrollDraw = 0;
  let drawnQuiet = "";
  const quietKey = (zones: QuietZone[]) => zones.map((zone) => zone.map(Math.round).join(",")).join(";");

  const resize = () => {
    css = [canvas.clientWidth || 1, canvas.clientHeight || 1];
    const scale = maxScale * quality;
    const width = Math.max(1, Math.round(css[0] * scale));
    const height = Math.max(1, Math.round(css[1] * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    instance.resize?.(css);
  };

  const draw = (holdChapter = false) => {
    if (lost) return;
    const reading = options.read?.() ?? { chapter: 0, quiet: [] };
    if (!holdChapter || chapter === null) chapter = reading.chapter;
    drawnQuiet = quietKey(reading.quiet);
    instance.draw({
      time,
      dt: lastDt,
      quality,
      chapter,
      quiet: reading.quiet,
      calm,
      grain,
      buffer: [canvas.width, canvas.height],
      css,
      scale: canvas.width / css[0],
      pointer,
      scroll: [scrollY, scrollSpeed],
      drift,
      held,
      pulse,
      pulseOrigin,
      tilt,
      still: raf === 0 && !manual,
      dark,
      stages: reading.stages ?? [],
    });
    // A redraw without an advance (a resize, a still frame) must not count as time passing.
    lastDt = 0;
    frames++;
  };

  const advance = (dt: number, clock: number) => {
    time += dt;
    lastDt = dt;

    // Pointer: eased toward where it last was; its presence fades when it rests.
    const follow = 1 - Math.exp(-dt * 7);
    pointer[0] += (pointerTarget[0] - pointer[0]) * follow;
    pointer[1] += (pointerTarget[1] - pointer[1]) * follow;
    const present = scripted ? scriptedPresence : clock - pointerSeen < 1.6 ? 1 : 0.18;
    pointer[2] += (present - pointer[2]) * (1 - Math.exp(-dt * 3));

    // Scroll: position, and a speed that dies away once scrolling stops.
    const y = window.scrollY / Math.max(1, window.innerHeight);
    const speed = dt > 0 ? (y - scrollY) / dt : 0;
    scrollY = y;
    scrollSpeed += (Math.max(-4, Math.min(4, speed)) - scrollSpeed) * (1 - Math.exp(-dt * 6));

    // The theme changes over a moment, not at once.
    dark += (darkTarget - dark) * (1 - Math.exp(-dt * 7));
    if (Math.abs(darkTarget - dark) < 0.002) dark = darkTarget;

    // State: drift builds slowly; a rebalance brings it back quickly.
    pulse += dt;
    const rate = pulse < 2 ? 4 : 0.9;
    drift += ((state === "drifting" ? 1 : 0) - drift) * (1 - Math.exp(-dt * rate));
    if (pulse > 3) held = drift;

    // Tilt: a critically damped spring toward a lean set by pointer, scroll and drift.
    const lean =
      (pointer[0] / css[0] - 0.5) * 0.12 * pointer[2] + scrollSpeed * 0.05 + drift * 0.07 * Math.sin(time * 0.35);
    tiltSpeed += (30 * (lean - tilt) - 11 * tiltSpeed) * dt;
    tilt += tiltSpeed * dt;
  };

  // Adaptive quality. Frame times are averaged over windows of about half
  // a second. Two slow windows in a row shrink the buffer one step, or
  // further at once when it is far over budget; a long run of fast
  // windows grows it back one step. If the smallest buffer is still far
  // too slow, the animation gives way to a still frame.
  //
  // Not every slow frame is the scene's doing. A browser saving battery,
  // or a phone in its low power mode, shows every second frame whatever
  // is drawn. Shrinking the buffer then buys nothing and only blurs the
  // picture, so if the smallest buffer comes no faster than the full one
  // did, the buffer goes back to where it was and stays there for as
  // long as the frames keep to that rate.
  const giveUp = () => {
    gaveUp = true;
    sync();
    options.onGiveUp?.();
  };
  const judge = (ms: number) => {
    windowSum += ms;
    windowCount++;
    if (windowSum < 550 && windowCount < 45) return;
    const mean = windowSum / windowCount;
    windowSum = 0;
    windowCount = 0;

    if (heldAt !== null) {
      if (mean > heldAt * 0.8 && mean < heldAt * 1.3) {
        // Still at the held rate: nothing drawn here decides it. Only a rate too slow to watch ends the animation.
        stuckWindows = mean > 42 ? stuckWindows + 1 : 0;
        if (stuckWindows >= 6) giveUp();
        return;
      }
      // Faster or slower than that again: adapt as usual.
      heldAt = null;
      slowWindows = fastWindows = stuckWindows = 0;
    }

    if (mean > 19.5) {
      slowWindows++;
      fastWindows = 0;
    } else if (mean < 17.2) {
      fastWindows++;
      slowWindows = 0;
      slowFrom = null;
    }

    if (quality <= MIN_QUALITY && mean > 42) {
      stuckWindows++;
      if (stuckWindows >= 6) giveUp();
      return;
    }
    stuckWindows = 0;

    if (slowWindows >= 2 && quality <= MIN_QUALITY && slowFrom && mean > slowFrom.mean * 0.88) {
      // The smallest buffer is no faster than the one it started from: the rate is held, not earned.
      heldAt = mean;
      quality = slowFrom.quality;
      slowFrom = null;
      slowWindows = 0;
      resize();
    } else if (slowWindows >= 2 && quality > MIN_QUALITY) {
      slowFrom ??= { quality, mean };
      const steps = mean > 50 ? 4 : mean > 30 ? 2 : 1;
      quality = Math.max(MIN_QUALITY, quality - 0.125 * steps);
      slowWindows = 0;
      resize();
    } else if (fastWindows >= 10 && quality < 1) {
      quality = Math.min(1, quality + 0.125);
      fastWindows = 0;
      resize();
    }
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const ms = last ? now - last : 16.7;
    last = now;
    // A gap of a second or more is the tab coming back, not a slow frame.
    if (ms < 1000) {
      times.push(ms);
      if (times.length > 240) times.shift();
      judge(ms);
    }
    advance(Math.min(0.05, ms / 1000), now / 1000);
    draw();
    if (simulatedCost > 0) {
      // A stand-in for a GPU that is bound by how many pixels it fills.
      const until = performance.now() + (simulatedCost * canvas.width * canvas.height) / 1e6;
      while (performance.now() < until);
    }
  };

  const shouldRun = () => !paused && !manual && visible && onScreen && !lost && !gaveUp && !options.reducedMotion;
  const sync = () => {
    if (shouldRun()) {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const handlePointer = (event: PointerEvent) => {
    if (scripted) return;
    pointerTarget[0] = event.clientX;
    pointerTarget[1] = event.clientY;
    pointerSeen = performance.now() / 1000;
  };
  const handleVisibility = () => {
    visible = !document.hidden;
    sync();
    // A resting scene is one frame, drawn once; a browser may let go of it while the tab is away.
    if (visible && !raf && !lost && !gaveUp) draw(!def.stillsFollowScroll);
  };
  // While the scene rests (paused, or a still under reduced motion) the
  // page can still scroll, and the text moves over a picture that does
  // not. One redraw per frame of scrolling keeps the quiet zones under
  // the text. Nothing else changes: time does not pass, and the chapter
  // stays the one that was showing, so pausing really does stop the motion.
  const handleScroll = () => {
    if (raf || scrollDraw || lost || gaveUp) return;
    scrollDraw = requestAnimationFrame(() => {
      scrollDraw = 0;
      if (!raf) draw(!def.stillsFollowScroll);
    });
  };
  // The text can also move with no scroll at all (another page, content
  // arriving late). A resting scene looks for that a few times a second
  // and redraws only if the text is somewhere new.
  const rest = window.setInterval(() => {
    if (raf || lost || gaveUp || document.hidden || !options.read) return;
    if (quietKey(options.read().quiet) !== drawnQuiet) draw(!def.stillsFollowScroll);
  }, 400);
  const handleLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    sync();
  };
  const handleRestored = () => {
    lost = false;
    instance = def.create(gl, { coarse, css });
    resize();
    sync();
    if (!raf) draw();
  };

  const observer = new ResizeObserver(() => {
    resize();
    if (!raf) draw();
  });
  observer.observe(canvas);
  const watcher = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });
  watcher.observe(canvas);
  window.addEventListener("pointermove", handlePointer, { passive: true });
  window.addEventListener("scroll", handleScroll, { passive: true });
  document.addEventListener("visibilitychange", handleVisibility);
  canvas.addEventListener("webglcontextlost", handleLost);
  canvas.addEventListener("webglcontextrestored", handleRestored);

  resize();
  draw();
  sync();

  return {
    setState(next) {
      state = next;
      if (options.reducedMotion || paused) {
        drift = next === "drifting" ? 1 : 0;
        held = drift;
        draw();
      }
    },
    pulse() {
      // A picture that is standing still (less motion asked for, or paused) shows no pulse.
      if (options.reducedMotion || paused) return;
      // Ahead of the ring the field stays as it is now; behind it, it is whatever the state says.
      held = drift;
      pulse = 0;
      pulseOrigin = pointer[2] > 0.5 ? [pointer[0], pointer[1]] : [css[0] / 2, css[1] / 2];
    },
    setPaused(next) {
      paused = next;
      sync();
    },
    setManual(next) {
      manual = next;
      sync();
    },
    step(dt) {
      advance(dt, time);
      draw();
    },
    setPointer(point, presence = 1) {
      scripted = point !== null;
      scriptedPresence = presence;
      if (point) {
        pointerTarget[0] = point[0];
        pointerTarget[1] = point[1];
      }
    },
    setLook(look) {
      if (look.calm !== undefined) calm = look.calm;
      if (look.grain !== undefined) grain = look.grain;
      if (look.dark !== undefined) {
        darkTarget = look.dark ? 1 : 0;
        // A scene that is not running takes the theme at once.
        if (!raf) dark = darkTarget;
      }
      if (!raf) draw();
    },
    setSimulatedCost(msPerMegapixel) {
      simulatedCost = msPerMegapixel;
    },
    stats() {
      const sorted = [...times].sort((a, b) => a - b);
      const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      return {
        fps: mean ? 1000 / mean : 0,
        p95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        worst: sorted.length ? sorted[sorted.length - 1] : 0,
        scale: canvas.width / css[0],
        quality,
        buffer: `${canvas.width}x${canvas.height}`,
        detail: instance.detail?.() ?? "",
        running: raf !== 0,
        gaveUp,
        frames,
      };
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      observer.disconnect();
      watcher.disconnect();
      if (scrollDraw) cancelAnimationFrame(scrollDraw);
      window.clearInterval(rest);
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
      instance.dispose();
    },
  };
}

// ── Small WebGL helpers the concepts share ───────────────────────────────

export function compile(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create a shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader did not compile: ${gl.getShaderInfoLog(shader) ?? ""}`);
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program did not link: ${gl.getProgramInfoLog(program) ?? ""}`);
  }
  return program;
}

/** Looks up a program's uniforms by name, once. */
export function uniforms<T extends string>(gl: WebGLRenderingContext, program: WebGLProgram, names: readonly T[]) {
  return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<
    T,
    WebGLUniformLocation | null
  >;
}

/** Screen-space derivatives, where the GPU has them: anti-aliased lines at any size. */
export function derivativesHeader(gl: WebGLRenderingContext): string {
  return gl.getExtension("OES_standard_derivatives")
    ? "#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES\n"
    : "";
}
