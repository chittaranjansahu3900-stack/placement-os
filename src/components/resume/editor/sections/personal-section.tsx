"use client";

import { resumeFieldKey } from "@/components/shared/resume-preview";
import { cardClass, inputClass, labelClass } from "../shared";
import type { CvContent } from "@/types/domain";

export function PersonalSection({
  personalInfo,
  onChange,
  registerRef,
}: {
  personalInfo: CvContent["personalInfo"];
  onChange: (field: keyof CvContent["personalInfo"], value: string) => void;
  registerRef: (el: HTMLElement | null) => void;
}) {
  return (
    <section ref={registerRef} className={cardClass}>
      <h2 className="mb-3 border-b border-[#1e293b] pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
        Personal &amp; Contact Header
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Full Candidate Name</label>
          <input
            data-field={resumeFieldKey({ section: "personal", field: "name" })}
            value={personalInfo.name}
            onChange={(event) => onChange("name", event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Resume Headline</label>
          <input
            data-field={resumeFieldKey({ section: "personal", field: "headline" })}
            value={personalInfo.headline}
            onChange={(event) => onChange("headline", event.target.value.slice(0, 80))}
            placeholder="Senior PM | Fintech · Growth | 0→1 (80 chars max)"
            maxLength={80}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Phone Number</label>
          <input
            data-field={resumeFieldKey({ section: "personal", field: "phone" })}
            value={personalInfo.phone}
            onChange={(event) => onChange("phone", event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Institute Email</label>
          <input
            data-field={resumeFieldKey({ section: "personal", field: "email" })}
            value={personalInfo.email}
            onChange={(event) => onChange("email", event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>LinkedIn</label>
          <input
            data-field={resumeFieldKey({ section: "personal", field: "linkedin" })}
            value={personalInfo.linkedin}
            onChange={(event) => onChange("linkedin", event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Website / Portfolio</label>
          <input
            data-field={resumeFieldKey({ section: "personal", field: "website" })}
            value={personalInfo.website}
            onChange={(event) => onChange("website", event.target.value)}
            placeholder="github.com/yourname or yourname.dev"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Location</label>
          <input
            data-field={resumeFieldKey({ section: "personal", field: "location" })}
            value={personalInfo.location}
            onChange={(event) => onChange("location", event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Total Experience</label>
          <input
            value={personalInfo.totalExperience}
            onChange={(event) => onChange("totalExperience", event.target.value)}
            placeholder="e.g. 6 Years"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Date of Birth (optional)</label>
          <input
            value={personalInfo.dateOfBirth}
            onChange={(event) => onChange("dateOfBirth", event.target.value)}
            placeholder="e.g. 15 Aug 1995"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Gender (optional)</label>
          <input
            value={personalInfo.gender}
            onChange={(event) => onChange("gender", event.target.value)}
            placeholder="e.g. Male / Female"
            className={inputClass}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className={labelClass}>Executive Summary (optional)</label>
        <textarea
          data-field={resumeFieldKey({ section: "personal", field: "summary" })}
          value={personalInfo.summary}
          onChange={(event) => onChange("summary", event.target.value)}
          rows={2}
          className={inputClass}
        />
      </div>
    </section>
  );
}
