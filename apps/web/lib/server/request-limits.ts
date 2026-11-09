import "server-only";

/*
  Bounds on what the POST endpoints will read from a request.
*/

/**
 * The most a POST /api/deployer body may be. The largest legitimate one is
 * an install: a function and one signed authorization entry, about 7 KB
 * even with a 1,023-byte credential id (the most WebAuthn allows) and a
 * long client data string. 32 KiB is over four times that.
 */
export const DEPLOYER_MAX_BODY_BYTES = 32 * 1024;

/** The most a POST /api/rebalance body may be: it carries one account address, about 80 bytes. */
export const REBALANCE_MAX_BODY_BYTES = 1024;

export type BodyRead = { ok: true; json: unknown } | { ok: false; reason: "too-large" | "invalid" };

/**
 * Reads a request body as JSON, never holding more than `maxBytes` of it.
 * A declared Content-Length over the cap is refused before anything is
 * read; one that is absent or understated is caught by counting the bytes
 * as they arrive, and the read is cancelled when the cap is passed.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyRead> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: "too-large" };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, reason: "invalid" };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: "too-large" };
    }
    chunks.push(value);
  }

  try {
    return { ok: true, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
