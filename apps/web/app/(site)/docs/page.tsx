import type { Metadata } from "next";
import { DocsView } from "@/components/docs/docs-view";
import { TECHNICAL_SECTIONS } from "@/components/docs/technical-content";
import { USER_SECTIONS } from "@/components/docs/user-content";

export const metadata: Metadata = {
  title: "Docs | Otolith",
  description:
    "How Otolith keeps a portfolio balanced without taking custody, for the person using it and for the person reading the contracts.",
};

/**
 * The docs: a user guide and a technical guide, each with its own
 * contents list and FAQ. The writing is in components/docs; this page only
 * sets the frame, inside the site layout's header and footer.
 */
export default function DocsPage() {
  return (
    <div data-quiet="" className="ot-container flex flex-col gap-10 py-10 sm:py-14">
      <header className="flex flex-col gap-4">
        <p className="ot-caps">Documentation</p>
        <h1 className="font-display text-2xl font-medium tracking-display text-text">Docs</h1>
        <p className="max-w-2xl text-base leading-relaxed text-text-muted">
          Otolith keeps a portfolio near a target split without ever holding the funds. These pages say how, in plain
          terms first and then in the contracts&rsquo; own.
        </p>
      </header>

      <DocsView user={USER_SECTIONS} technical={TECHNICAL_SECTIONS} />
    </div>
  );
}
