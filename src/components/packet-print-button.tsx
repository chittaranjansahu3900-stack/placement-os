"use client";

import { OpsIcon } from "@/components/ops-icon";

export function PacketPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="ops-button-primary text-xs"
    >
      <OpsIcon name="printer" size={13} />
      Print / Save Merged PDF
    </button>
  );
}
