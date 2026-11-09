"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Reveal } from "@/components/reveal";
import { Icon } from "@/components/ui/icons";
import { Readout, type DocSection } from "./docs-primitives";

type GuideId = "user" | "technical";

type DocsViewProps = {
  /** The two guides, each already written as sections. */
  user: DocSection[];
  technical: DocSection[];
};

const GUIDES: { id: GuideId; label: string; lead: string }[] = [
  {
    id: "user",
    label: "User",
    lead: "How Otolith works for the person who owns the account: what it does, what you set, and what stops it from doing anything else.",
  },
  {
    id: "technical",
    label: "Technical",
    lead: "The architecture, read from the code: the account, the two contracts, the oracle and the server, with the real parameters and addresses.",
  },
];

// A few readings from each guide, set like an instrument panel above it.
const READOUTS: Record<GuideId, { label: string; value: string }[]> = {
  user: [
    { label: "Network", value: "Stellar testnet" },
    { label: "Pair", value: "XLM and USDC" },
    { label: "Direction", value: "Sells XLM, buys USDC" },
    { label: "Custody", value: "Your account only" },
  ],
  technical: [
    { label: "Price freshness", value: "600 s" },
    { label: "Cooldown", value: "5 min to 7 days" },
    { label: "Slippage floor", value: "30 to 500 bps" },
    { label: "Overshoot", value: "50 bps at most" },
  ],
};

/**
 * The docs: a selector between the two guides, a list of the active
 * guide's headings beside it (above it on a phone), and the guide itself.
 *
 * The sections are written on the server and handed in as markup; this only
 * decides which guide shows, keeps the list's current heading in step with
 * the scroll, and takes a link to a heading in the other guide (docs#tech-oracle)
 * to the right guide first.
 */
export function DocsView({ user, technical }: DocsViewProps) {
  const baseId = useId();
  const [guide, setGuide] = useState<GuideId>("user");
  const [activeId, setActiveId] = useState<string | null>(null);
  const tocRef = useRef<HTMLDetailsElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<GuideId, HTMLButtonElement>());

  const sections = guide === "user" ? user : technical;

  // A link such as /docs#tech-oracle names a heading in either guide: show
  // that guide, then go to the heading once it is on the page.
  useEffect(() => {
    const goToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const owner: GuideId | null = user.some((s) => s.id === id)
        ? "user"
        : technical.some((s) => s.id === id)
          ? "technical"
          : null;
      if (!owner) return;
      setGuide(owner);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    };
    goToHash();
    window.addEventListener("hashchange", goToHash);
    return () => window.removeEventListener("hashchange", goToHash);
  }, [user, technical]);

  // The heading nearest the top of the screen is the current one.
  useEffect(() => {
    const nodes = sections
      .map((section) => document.getElementById(section.id))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  const choose = useCallback((next: GuideId) => {
    setGuide(next);
    setActiveId(null);
    // Back to the top of the guide if the reader was well down the other one.
    const top = topRef.current;
    if (top && top.getBoundingClientRect().top < 0) {
      top.scrollIntoView();
    }
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = GUIDES.findIndex((item) => item.id === guide);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % GUIDES.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + GUIDES.length) % GUIDES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = GUIDES.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = GUIDES[next].id;
    choose(target);
    tabRefs.current.get(target)?.focus();
  };

  const current = GUIDES.find((item) => item.id === guide) ?? GUIDES[0];

  const list = (
    <ol className="flex flex-col gap-1.5">
      {sections.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            aria-current={activeId === section.id ? "location" : undefined}
            onClick={() => {
              if (tocRef.current) tocRef.current.open = false;
            }}
            className="ot-navlink w-full items-start rounded-xl py-2 whitespace-normal before:hidden"
          >
            <span className="ot-num pt-0.5 text-xs text-accent">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 text-left">{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="flex flex-col gap-10">
      <div ref={topRef} className="flex scroll-mt-6 flex-col gap-6">
        <div role="tablist" aria-label="Documentation" className="ot-segmented w-fit" onKeyDown={handleKeyDown}>
          {GUIDES.map((item) => (
            <button
              key={item.id}
              ref={(node) => {
                if (node) tabRefs.current.set(item.id, node);
                else tabRefs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={guide === item.id}
              aria-controls={`${baseId}-panel`}
              tabIndex={guide === item.id ? 0 : -1}
              className="ot-segment px-5"
              onClick={() => choose(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="max-w-2xl text-base leading-relaxed text-text-muted">{current.lead}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {READOUTS[guide].map((readout) => (
            <Readout key={readout.label} label={readout.label} value={readout.value} />
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        {/* Below lg the list sits above the guide and folds away; from lg it
            stays in view beside it. */}
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <details ref={tocRef} className="group ot-raised rounded-xl lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="ot-caps">On this page</span>
              <Icon
                name="chevron-down"
                size={18}
                className="text-text-muted transition-transform duration-150 group-open:rotate-180"
              />
            </summary>
            <nav aria-label="On this page" className="px-3 pb-3">
              {list}
            </nav>
          </details>
          <nav aria-label="On this page" className="ot-raised hidden rounded-xl p-3 lg:block">
            <p className="ot-caps px-3 pb-3 pt-1">On this page</p>
            {list}
          </nav>
        </aside>

        <div
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${guide}`}
          className="flex min-w-0 flex-col gap-16"
        >
          {sections.map((section, index) => (
            <section
              key={`${guide}-${section.id}`}
              id={section.id}
              aria-labelledby={`${section.id}-heading`}
              className="flex scroll-mt-6 flex-col gap-5"
            >
              {/* Only the heading settles into view: the text under it is always there, for print, find in page and a jump straight to it. */}
              <Reveal className="flex flex-col gap-5">
                <p className="ot-chapter-label">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <i aria-hidden="true" />
                  <span>{current.label}</span>
                </p>
                <h2
                  id={`${section.id}-heading`}
                  className="font-display text-xl font-medium tracking-display text-text"
                >
                  {section.title}
                </h2>
              </Reveal>
              {section.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
