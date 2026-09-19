"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { OpsIcon, type OpsIconName } from "@/components/shared/ops-icon";

export function AdminActionButton({
  children,
  pendingLabel = "Working...",
  icon,
  className,
  title,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  icon?: OpsIconName;
  className: string;
  title?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      title={title}
      disabled={pending}
      aria-disabled={pending}
      className={`${className} justify-center disabled:cursor-wait disabled:opacity-60`}
    >
      <OpsIcon
        name={pending ? "refresh" : (icon ?? "check")}
        size={13}
        className={pending ? "shrink-0 animate-spin" : "shrink-0"}
      />
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}

export function SubmitOnChangeSelect({
  name,
  defaultValue = "",
  label,
  className,
  children,
}: {
  name: string;
  defaultValue?: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <select
      name={name}
      key={`${name}-${defaultValue}`}
      defaultValue={defaultValue}
      aria-label={label}
      disabled={pending}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className={`${className ?? "ops-select"} disabled:cursor-wait disabled:opacity-60`}
    >
      {children}
    </select>
  );
}

export function UserAccessAccordion({
  userId,
  summaryLabel,
  children,
}: {
  userId: string;
  summaryLabel: React.ReactNode;
  children: React.ReactNode;
}) {
  const storageKey = `user-access-open-${userId}`;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Reading sessionStorage during render would mismatch the server-rendered
    // closed state, so this intentionally applies the persisted state only
    // after mount, on the client.
    try {
      const stored = sessionStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === "true") setIsOpen(true);
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  const toggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        if (next) sessionStorage.setItem(storageKey, "true");
        else sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  return (
    <div className={`mt-2 rounded-md border transition-colors ${isOpen ? "border-slate-750 bg-slate-950/60" : "border-transparent"}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full min-h-8 cursor-pointer items-center gap-2 rounded px-2 font-mono text-[10px] font-semibold text-slate-500 transition-colors hover:bg-slate-800/50 hover:text-slate-300 text-left"
      >
        <OpsIcon
          name="chevron-right"
          size={12}
          className={`transition-transform duration-150 ${isOpen ? "rotate-90 text-blue-400" : ""}`}
        />
        <span>Edit access</span>
        <span className="font-normal text-slate-600">{summaryLabel}</span>
      </button>
      {isOpen && (
        <div className="grid gap-4 border-t border-slate-800 p-3 lg:grid-cols-2 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
