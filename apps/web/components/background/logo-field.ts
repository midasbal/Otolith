/*
  The integral's distance field: for every point near the integral sign,
  how far it is from the sign's edge. The scene draws the integral from
  it, exactly, at any size, and places particles inside it.

  It is worked out ahead of time and shipped as a small greyscale image
  (public/logo/integral-field.png), because working it out in the
  browser costs a noticeable pause on a phone. One byte a texel: half way
  (127.5) is the edge, brighter is inside. To rebuild it after a change
  to the logo's geometry, see the README.
*/

export const FIELD = {
  url: "/logo/integral-field.png",
  /** Half the width and half the height of what the image covers, in logo units, centred on the logo's origin. */
  x: 0.74,
  y: 0.88,
  /** Texels to a logo unit. */
  perUnit: 320,
  /** How far, in logo units, the stored distances reach either side of the edge. */
  spread: 0.045,
} as const;

export type LogoField = {
  width: number;
  height: number;
  /** One byte a texel, bottom row first, as WebGL reads a texture. */
  bytes: Uint8Array;
};

export async function loadLogoField(): Promise<LogoField> {
  const response = await fetch(FIELD.url);
  if (!response.ok) throw new Error(`The logo's distance field did not load (${response.status}).`);
  // As stored: no color conversion, or the distances would shift.
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas to read the logo's distance field with.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height).data;
  const bytes = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) bytes[y * width + x] = pixels[from + x * 4];
  }
  return { width, height, bytes };
}
