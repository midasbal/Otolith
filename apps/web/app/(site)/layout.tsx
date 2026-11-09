import { LandingHeader } from "@/components/landing-header";
import { SiteFooter } from "@/components/site-footer";

export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="ot-skip-link">
        Skip to content
      </a>
      <LandingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
