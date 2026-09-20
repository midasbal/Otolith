"use strict";

/**
 * Preloaded via NODE_OPTIONS (see package.json's dev/build/start scripts)
 * before any other module loads, in every Node process Next.js spawns
 * (the dev/prod server itself, and the build's own page-data-collection
 * workers alike). Exists for exactly one reason: patch a Node runtime
 * gap that @stellar/typescript-wallet-sdk's own dependency chain hits,
 * so lib/server/anchor.ts can import it at all.
 *
 * @stellar/typescript-wallet-sdk pulls in jws -> jwa ->
 * buffer-equal-constant-time for SEP-10's JWT handling.
 * buffer-equal-constant-time reads `require("buffer").SlowBuffer.prototype`
 * at load time, purely to save and later restore that prototype's
 * `equal` method. `SlowBuffer` was deprecated in Node for years and has
 * been removed outright in newer Node versions (undefined on Node 25,
 * the version this project runs), so that read throws before the SDK
 * ever finishes loading. `SlowBuffer` was always just a thin,
 * uninitialized-memory variant of `Buffer`; aliasing it back to `Buffer`
 * supplies the same `.prototype` shape the dependency expects, with no
 * behavior of ours depending on the distinction.
 */
const buffer = require("buffer");
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}
