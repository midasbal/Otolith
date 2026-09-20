// Next.js's own internal vendored copy of the buffer package has no
// published type declarations, since it is meant to be an internal
// implementation detail, not a public import. Its Buffer class has the
// same shape as the real buffer package's, missing only the BigInt64
// methods lib/buffer-polyfill.ts exists to add.
declare module "next/dist/compiled/buffer" {
  export const Buffer: typeof import("buffer").Buffer;
}
