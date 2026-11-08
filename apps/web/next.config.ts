import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js otherwise auto-generates apps/web/AGENTS.md and
  // apps/web/CLAUDE.md on every dev/build run. Turned off: this repo's
  // own docs/ directory is the real documentation, and CLAUDE.md as a
  // filename doesn't belong in this project.
  agentRules: false,
};

export default nextConfig;
