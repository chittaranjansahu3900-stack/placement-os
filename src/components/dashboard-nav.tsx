"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OpsIcon, type OpsIconName } from "@/components/ops-icon";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: OpsIconName;
  exact?: boolean;
};

export type DashboardNavGroup = {
  label: string;
  items: DashboardNavItem[];
};

function isItemActive(pathname: string, item: DashboardNavItem) {
  if (item.exact || item.href === "/dashboard") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, compact = false }: { item: DashboardNavItem; compact?: boolean }) {
  const pathname = usePathname();
  const active = isItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 border text-xs font-medium transition-colors ${
        compact ? "min-h-10 rounded px-3" : "min-h-9 rounded px-2.5"
      } ${
        active
          ? "border-blue-700 bg-blue-950 text-blue-200"
          : "border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-900 hover:text-white"
      }`}
    >
      <OpsIcon name={item.icon} size={15} className={active ? "text-blue-400" : "text-slate-400"} />
      <span>{item.label}</span>
    </Link>
  );
}

export function DashboardNav({ groups }: { groups: DashboardNavGroup[] }) {
  const items = groups.flatMap((group) => group.items);

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col justify-between overflow-y-auto border-r border-slate-800 bg-[#0d1928] p-3.5 lg:flex">
        <nav aria-label="Primary navigation" className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="ops-eyebrow px-2 pb-1.5 text-[10px] text-slate-500">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={`${group.label}-${item.href}`} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <nav
        aria-label="Primary navigation"
        className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-[#0d1928] px-3 py-2 lg:hidden"
      >
        {items.map((item) => (
          <NavLink key={item.href} item={item} compact />
        ))}
      </nav>
    </>
  );
}
