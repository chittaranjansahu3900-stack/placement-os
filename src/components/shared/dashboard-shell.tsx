"use client";

import { usePathname } from "next/navigation";
import { DashboardNav, type DashboardNavGroup } from "./dashboard-nav";

// CV Studio (Cursivo-matching) manages its own full-width chrome and rail —
// the outer app sidebar would be redundant next to it, so it's hidden here.
// /resume itself is just the version list and keeps the normal app shell.
const FULL_BLEED_ROUTES = ["/resume/studio"];

export function DashboardShell({
  groups,
  children,
}: {
  groups: DashboardNavGroup[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED_ROUTES.includes(pathname);

  if (fullBleed) {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#090d16] p-3 sm:p-4">
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <DashboardNav groups={groups} />
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#090d16] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
