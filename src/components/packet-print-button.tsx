"use client";

export function PacketPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-white px-3 py-2 text-xs font-medium text-neutral-950 hover:bg-neutral-200"
    >
      Print / Save merged PDF
    </button>
  );
}
