/**
 * smart-account-kit's dependency chain assumes an ambient Node-style
 * global `Buffer`. Two separate things go wrong with that in a real
 * Next.js browser bundle:
 *
 * 1. base64url (a dependency of smart-account-kit) never imports
 *    "buffer" at all: it reads a bare, ambient global `Buffer`, exactly
 *    like Node.js provides one. No module-resolution alias can ever fix
 *    that, since there is no import to intercept.
 * 2. Next.js itself sets that global (and separately aliases any
 *    explicit `import ... from "buffer"`) to its own internal, vendored
 *    copy at next/dist/compiled/buffer, for its own framework needs.
 *    That vendored copy predates BigInt support entirely: it has none of
 *    readBigInt64BE, readBigUInt64BE, readBigInt64LE, readBigUInt64LE,
 *    writeBigInt64BE, writeBigUInt64BE, writeBigInt64LE, or
 *    writeBigUInt64LE, which the Stellar SDK and smart-account-kit need
 *    to parse and build Soroban i64/u64 values.
 *
 * A prior attempt fixed this by aliasing the "buffer" module specifier
 * in next.config.ts to the real buffer npm package. That did not work in
 * a real browser: the failing call still resolved into
 * next/dist/compiled/buffer, confirmed directly by the runtime stack
 * trace, which lines up with point 1 above (an alias only changes what
 * an import resolves to, and the actual failure is an ambient global
 * read, not an import).
 *
 * The robust fix does not try to change which Buffer class anything
 * gets. It patches the BigInt64 methods directly onto the actual
 * Buffer.prototype that Next.js's compiled copy exports, in place, the
 * same class the failing stack trace names. Mutating a prototype affects
 * every existing and future instance of that class immediately, no
 * matter which import, global read, or re-export handed a caller the
 * reference to it, so this fixes the ambient-global case, the explicit
 * `import { Buffer } from "buffer"` case, and everything in between with
 * one patch on one object. The real buffer npm package's own class is
 * patched too, defensively, in case anything genuinely does end up using
 * it instead. `globalThis.Buffer` is then set to the patched
 * next-compiled class explicitly, matching whatever Next itself already
 * uses at the point the failing call actually constructs a Buffer.
 *
 * The implementations below follow Node's own documented semantics:
 * eight bytes at the given offset (default 0), interpreted as a signed
 * or unsigned 64-bit integer, big-endian or little-endian, read or
 * written via DataView over the instance's own underlying bytes
 * (respecting byteOffset, since a Buffer can be a view into a larger
 * ArrayBuffer), with the same bounds check Node's own implementation
 * uses.
 *
 * Importing the class itself is safe unconditionally, including during
 * SSR: it is a plain CommonJS module with no side effects of its own.
 * Only the patching and the global assignment below are guarded to
 * client-side only.
 */
import { Buffer as RealBuffer } from "buffer";
import { Buffer as NextCompiledBuffer } from "next/dist/compiled/buffer";

type PatchableBufferClass = {
  prototype: {
    readBigInt64BE?: unknown;
    [key: string]: unknown;
  };
};

type BufferLikeInstance = {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
};

function patchBigInt64Methods(bufferClass: PatchableBufferClass) {
  const proto = bufferClass.prototype;
  if (typeof proto.readBigInt64BE === "function") {
    return;
  }

  function getView(buf: BufferLikeInstance) {
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  function checkOffset(buf: BufferLikeInstance, offset: number) {
    if (offset < 0 || offset + 8 > buf.byteLength) {
      throw new RangeError(
        `The value of "offset" is out of range. It must be >= 0 and <= ${
          buf.byteLength - 8
        }. Received ${offset}`,
      );
    }
  }

  proto.readBigUInt64LE = function readBigUInt64LE(this: BufferLikeInstance, offset = 0) {
    checkOffset(this, offset);
    return getView(this).getBigUint64(offset, true);
  };
  proto.readBigUInt64BE = function readBigUInt64BE(this: BufferLikeInstance, offset = 0) {
    checkOffset(this, offset);
    return getView(this).getBigUint64(offset, false);
  };
  proto.readBigInt64LE = function readBigInt64LE(this: BufferLikeInstance, offset = 0) {
    checkOffset(this, offset);
    return getView(this).getBigInt64(offset, true);
  };
  proto.readBigInt64BE = function readBigInt64BE(this: BufferLikeInstance, offset = 0) {
    checkOffset(this, offset);
    return getView(this).getBigInt64(offset, false);
  };
  proto.writeBigUInt64LE = function writeBigUInt64LE(
    this: BufferLikeInstance,
    value: bigint,
    offset = 0,
  ) {
    checkOffset(this, offset);
    getView(this).setBigUint64(offset, value, true);
    return offset + 8;
  };
  proto.writeBigUInt64BE = function writeBigUInt64BE(
    this: BufferLikeInstance,
    value: bigint,
    offset = 0,
  ) {
    checkOffset(this, offset);
    getView(this).setBigUint64(offset, value, false);
    return offset + 8;
  };
  proto.writeBigInt64LE = function writeBigInt64LE(
    this: BufferLikeInstance,
    value: bigint,
    offset = 0,
  ) {
    checkOffset(this, offset);
    getView(this).setBigInt64(offset, value, true);
    return offset + 8;
  };
  proto.writeBigInt64BE = function writeBigInt64BE(
    this: BufferLikeInstance,
    value: bigint,
    offset = 0,
  ) {
    checkOffset(this, offset);
    getView(this).setBigInt64(offset, value, false);
    return offset + 8;
  };
}

declare global {
  interface Window {
    Buffer?: typeof RealBuffer;
  }
}

if (typeof window !== "undefined") {
  patchBigInt64Methods(NextCompiledBuffer as unknown as PatchableBufferClass);
  patchBigInt64Methods(RealBuffer as unknown as PatchableBufferClass);

  // Next.js itself is the one setting the ambient global in the first
  // place (that is how base64url's bare `Buffer` reference ends up
  // pointing at next/dist/compiled/buffer at all), so match that: keep
  // the global pointed at the same, now-patched, class rather than
  // introducing a second, different Buffer class as the global.
  window.Buffer = NextCompiledBuffer as unknown as typeof RealBuffer;

  const liveBuffer = window.Buffer;
  if (typeof liveBuffer.prototype.readBigInt64BE === "function") {
    console.log("[buffer-polyfill] BigInt64 Buffer methods confirmed present on window.Buffer.");
  } else {
    console.error(
      "[buffer-polyfill] window.Buffer is still missing readBigInt64BE after patching. " +
        "Code paths in the Stellar SDK or smart-account-kit that read or write Soroban " +
        "i64/u64 values will throw.",
    );
  }
}
