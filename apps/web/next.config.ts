import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @stellar/typescript-wallet-sdk ships only a pre-bundled webpack UMD
  // output (no raw source or CJS build), which breaks when Next's own
  // bundler tries to bundle it a second time ("Cannot read properties of
  // undefined (reading 'prototype')" from a collided module registry).
  // It is only ever imported from server-only code (lib/server/anchor.ts),
  // so telling Next to leave it external and load it via Node's own
  // require at runtime avoids the double-bundling entirely.
  serverExternalPackages: ["@stellar/typescript-wallet-sdk"],

  // Next.js otherwise auto-generates apps/web/AGENTS.md and
  // apps/web/CLAUDE.md on every dev/build run. Turned off: this repo's
  // own docs/ directory is the real documentation, and CLAUDE.md as a
  // filename doesn't belong in this project.
  agentRules: false,
};

export default nextConfig;
