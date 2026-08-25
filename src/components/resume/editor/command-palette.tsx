"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OpsIcon, type OpsIconName } from "@/components/shared/ops-icon";
import { RAIL_SECTIONS, cmdItemClass } from "./shared";
import { CV_TEMPLATES } from "@/lib/resume-templates";

type Category = "navigate" | "document" | "export" | "ai";

type Command = {
  id: string;
  label: string;
  category: Category;
  icon: OpsIconName;
  kbd?: string[];
  selector: string;
};

const CATEGORY_LABEL: Record<Category, string> = {
  navigate: "Navigate",
  document: "Document",
  export: "Export",
  ai: "AI",
};

function runSelector(selector: string) {
  document.querySelector<HTMLElement>(selector)?.click();
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(() => {
    const nav: Command[] = RAIL_SECTIONS.map((section) => ({
      id: `nav-${section.key}`,
      label: `Go to ${section.label}`,
      category: "navigate",
      icon: section.icon,
      selector: `[data-rail-section="${section.key}"]`,
    }));
    const doc: Command[] = [
      { id: "expand-all", label: "Expand all sections", category: "document", icon: "chevron-down", selector: '[data-cmd="expand-all"]' },
      { id: "collapse-all", label: "Collapse all sections", category: "document", icon: "chevron-up", selector: '[data-cmd="collapse-all"]' },
      ...CV_TEMPLATES.map((template) => ({
        id: `template-${template.id}`,
        label: `Switch to ${template.name}`,
        category: "document" as const,
        icon: "layers" as OpsIconName,
        selector: `[data-cmd="template-${template.id}"]`,
      })),
    ];
    const exportCmds: Command[] = [
      { id: "print", label: "Print / Save PDF", category: "export", icon: "printer", selector: '[data-cmd="print"]' },
      { id: "export-docx", label: "Download Word (.docx)", category: "export", icon: "download", selector: '[data-cmd="export-docx"]' },
      { id: "save", label: "Save CV Document", category: "export", icon: "check", kbd: ["Ctrl", "S"], selector: '[data-cmd="save"]' },
    ];
    const ai: Command[] = [
      { id: "open-ai-assistant", label: "Open AI Assistant", category: "ai", icon: "sparkles", selector: '[data-cmd="open-ai-assistant"]' },
    ];
    return [...nav, ...doc, ...exportCmds, ...ai];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
    const groups: Partial<Record<Category, Command[]>> = {};
    for (const cmd of list) {
      (groups[cmd.category] ??= []).push(cmd);
    }
    return groups;
  }, [commands, query]);

  // The parent only mounts this component while `open` is true, so `query`
  // already starts blank on every mount — just focus the input.
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function runCommand(cmd: Command) {
    onClose();
    setTimeout(() => runSelector(cmd.selector), 0);
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-box" onClick={(event) => event.stopPropagation()}>
        <div className="cmd-input-wrap">
          <OpsIcon name="search" size={16} className="text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands…"
            className="cmd-input"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmd-list">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((category) => {
            const items = filtered[category];
            if (!items || items.length === 0) return null;
            return (
              <div key={category}>
                <div className="cmd-section-h">{CATEGORY_LABEL[category]}</div>
                {items.map((cmd) => (
                  <div
                    key={cmd.id}
                    className={`${cmdItemClass} cmd-item-${category}`}
                    onClick={() => runCommand(cmd)}
                  >
                    <span className="cmd-icon">
                      <OpsIcon name={cmd.icon} size={14} />
                    </span>
                    <span className="cmd-label">{cmd.label}</span>
                    {cmd.kbd && (
                      <span className="cmd-kbd">
                        {cmd.kbd.map((k) => (
                          <span key={k} className="kbd">{k}</span>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {Object.keys(filtered).length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">No matching commands.</p>
          )}
        </div>
      </div>
    </div>
  );
}
