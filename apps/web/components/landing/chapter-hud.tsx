"use client";

import { useEffect, useState } from "react";

/*
  The chapter marker: a small fixed line that names the chapter of the
  page in view, and its number. It reads the same markup the background
  does (data-chapter, with the chapter's name in data-chapter-name).
  Decorative: every chapter has its own heading, so this is hidden from
  assistive technology, and it is only shown where there is room for it.
*/

export function ChapterHud() {
  const [current, setCurrent] = useState<{ index: number; name: string; count: number } | null>(null);
  // The marker steps aside for the footer, whose links sit where it does.
  const [atFooter, setAtFooter] = useState(false);

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("[data-chapter][data-chapter-name]")];
    if (sections.length === 0) return;
    // Whichever chapter crosses the middle of the screen is the current one.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const section = entry.target as HTMLElement;
          setCurrent({ index: sections.indexOf(section), name: section.dataset.chapterName ?? "", count: sections.length });
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const section of sections) observer.observe(section);

    const footer = document.querySelector("footer");
    const footerObserver = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting));
    if (footer) footerObserver.observe(footer);

    return () => {
      observer.disconnect();
      footerObserver.disconnect();
    };
  }, []);

  if (!current || atFooter) return null;

  return (
    <div aria-hidden="true" className="ot-hud">
      <span className="ot-hud-index">{String(current.index).padStart(2, "0")}</span>
      <span className="ot-hud-track">
        <span className="ot-hud-fill" style={{ transform: `scaleX(${(current.index + 1) / current.count})` }} />
      </span>
      <span>{current.name}</span>
    </div>
  );
}
