"use client";

import { BulletRow } from "./bullet-row";
import { addButtonClass, newId } from "./shared";
import type { CvBullet } from "@/types/domain";

export function BulletEditor({
  bullets, onChange, dataFieldBase, documentId,
}: {
  bullets: CvBullet[];
  onChange: (bullets: CvBullet[]) => void;
  dataFieldBase?: string;
  documentId: string;
}) {
  return (
    <div className="space-y-2">
      {bullets.map((bullet, index) => (
        <BulletRow
          key={bullet.id}
          bullet={bullet}
          documentId={documentId}
          dataField={index === 0 ? dataFieldBase : undefined}
          onChange={(text) => onChange(bullets.map((b, i) => (i === index ? { ...b, text } : b)))}
          onRemove={() => onChange(bullets.filter((_, i) => i !== index))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...bullets, { id: newId("bullet"), text: "" }])}
        className={addButtonClass}
      >
        + Add bullet
      </button>
    </div>
  );
}
