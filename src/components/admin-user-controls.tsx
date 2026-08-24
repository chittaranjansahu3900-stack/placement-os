"use client";

import { useFormStatus } from "react-dom";
import { OpsIcon, type OpsIconName } from "@/components/ops-icon";

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
