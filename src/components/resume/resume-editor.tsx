"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { resumeFieldKey, type ResumeFieldSpec } from "@/components/shared/resume-preview";
import { normalizeCvContent } from "@/lib/resume";
import { normalizeCvTemplateId } from "@/lib/resume-templates";
import { OpsIcon } from "@/components/shared/ops-icon";
import { TopbarDropdown } from "@/components/resume/topbar-dropdown";
import { ResumeTopbar } from "./editor/topbar";
import { IconRail } from "./editor/icon-rail";
import { ResizablePanel } from "./editor/resizable-panel";
import { PreviewCanvas } from "./editor/preview-canvas";
import { RightDrawer } from "./editor/right-drawer";
import { SectionHeader } from "./editor/section-header";
import { StringListEditor } from "./editor/string-list-editor";
import { PersonalSection } from "./editor/sections/personal-section";
import { AcademicsSection } from "./editor/sections/academics-section";
import { ExperienceSection } from "./editor/sections/experience-section";
import { ProjectsSection } from "./editor/sections/projects-section";
import { LanguagesSection } from "./editor/sections/languages-section";
import { PublicationsSection } from "./editor/sections/publications-section";
import { CustomSectionsSection } from "./editor/sections/custom-sections-section";
import { AchievementBuilderSection } from "./editor/sections/achievement-builder-section";
import {
  addButtonClass,
  cardClass,
  inputClass,
  moveArrayItem,
  newId,
  topbarBtnClass,
  type CvVersionRow,
  type ReviewCommentWithAuthor,
  type UpcomingJd,
} from "./editor/shared";
import type {
  CompanyTypePersona,
  CvAcademicEntry,
  CvContent,
  CvCustomSection,
  CvExperienceEntry,
  CvLanguageEntry,
  CvProjectEntry,
  CvPublicationEntry,
} from "@/types/domain";

const ResumeAiAssistant = dynamic(() => import("./resume-ai-assistant").then((m) => m.ResumeAiAssistant), { ssr: false });
const CommandPalette = dynamic(() => import("./editor/command-palette").then((m) => m.CommandPalette), { ssr: false });
const CvHealthPanel = dynamic(() => import("./editor/panels/cv-health-panel").then((m) => m.CvHealthPanel), { ssr: false });
const FindReplacePanel = dynamic(() => import("./editor/panels/find-replace-panel").then((m) => m.FindReplacePanel), { ssr: false });
const VersionDiffPanel = dynamic(() => import("./editor/panels/version-diff-panel").then((m) => m.VersionDiffPanel), { ssr: false });
const FocusMode = dynamic(() => import("./editor/panels/focus-mode").then((m) => m.FocusMode), { ssr: false });

type ToolsDrawer = "health" | "find-replace" | "diff" | null;

export function ResumeEditor({
  documentId,
  initialContent,
  initialTemplateId,
  comments,
  versions,
  personas,
  upcomingJds,
}: {
  documentId: string;
  initialContent: CvContent;
  initialTemplateId: string;
  comments: ReviewCommentWithAuthor[];
  versions: CvVersionRow[];
  personas: CompanyTypePersona[];
  upcomingJds: UpcomingJd[];
}) {
  const [content, setContent] = useState(() => normalizeCvContent(initialContent));
  const [templateId, setTemplateId] = useState(() => normalizeCvTemplateId(initialTemplateId));
  const [builder, setBuilder] = useState({ action: "", outcome: "", metric: "" });
  const [skillInput, setSkillInput] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [zoom, setZoom] = useState(100);

  const [activeRailKey, setActiveRailKey] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [toolsDrawer, setToolsDrawer] = useState<ToolsDrawer>(null);
  // null = the full continuous list (default); a key = only that section is
  // shown, everything else removed from layout — set whenever a rail icon
  // is clicked, matching Cursivo's single-section navigation.
  const [isolatedKey, setIsolatedKey] = useState<string | null>(null);

  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const detailsRefs = useRef(new Map<string, HTMLDetailsElement>());
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function scrollToSection(key: string) {
    setActiveRailKey(key);
    setIsolatedKey(key);
    const target = sectionRefs.current.get(key);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    // A late webfont swap can reflow the panel after the scroll above has
    // already settled, leaving the section slightly off the top edge — snap
    // it back once the real font is in.
    document.fonts?.ready?.then(() => {
      if (sectionRefs.current.get(key) === target) target?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    });
  }

  function registerSectionRef(key: string, el: HTMLElement | null) {
    if (el) sectionRefs.current.set(key, el);
  }

  function registerDetailsRef(id: string, el: HTMLDetailsElement | null) {
    if (el) detailsRefs.current.set(id, el);
    else detailsRefs.current.delete(id);
  }

  function handleFieldClick(spec: ResumeFieldSpec) {
    // The clicked field's section may currently be hidden by section
    // isolation — switch to it first so it's actually in the layout before
    // trying to scroll to / focus a field inside it.
    setActiveRailKey(spec.section);
    setIsolatedKey(spec.section);
    if (spec.entryId) {
      const details = detailsRefs.current.get(spec.entryId);
      if (details && !details.open) details.open = true;
    }
    const key = resumeFieldKey(spec);
    // Give the isolation/details-open state above a moment to re-render and
    // un-hide the target before scrolling to / focusing it.
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
    }, 60);
  }

  function toggleSectionHidden(key: string) {
    setContent((current) => ({
      ...current,
      hiddenSections: current.hiddenSections.includes(key)
        ? current.hiddenSections.filter((k) => k !== key)
        : [...current.hiddenSections, key],
    }));
  }

  function expandAll() {
    detailsRefs.current.forEach((el) => { el.open = true; });
  }
  function collapseAll() {
    detailsRefs.current.forEach((el) => { el.open = false; });
  }

  function fitZoom() {
    const width = canvasWrapperRef.current?.clientWidth;
    if (!width) return;
    setZoom(Math.max(40, Math.min(150, Math.round(((width - 48) / 794) * 100))));
  }
  useEffect(() => {
    fitZoom();
  }, []);

  function updatePersonal(field: keyof CvContent["personalInfo"], value: string) {
    setContent((current) => ({
      ...current,
      personalInfo: { ...current.personalInfo, [field]: value },
    }));
  }

  function updateAcademic(index: number, patch: Partial<CvAcademicEntry>) {
    setContent((current) => ({
      ...current,
      academics: current.academics.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function updateExperience(
    section: "experience" | "positions",
    index: number,
    patch: Partial<CvExperienceEntry>,
  ) {
    setContent((current) => ({
      ...current,
      [section]: current[section].map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function updateProject(index: number, patch: Partial<CvProjectEntry>) {
    setContent((current) => ({
      ...current,
      projects: current.projects.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function updateLanguage(index: number, patch: Partial<CvLanguageEntry>) {
    setContent((current) => ({
      ...current,
      languages: current.languages.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function updatePublication(index: number, patch: Partial<CvPublicationEntry>) {
    setContent((current) => ({
      ...current,
      publications: current.publications.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function updateCustomSection(index: number, patch: Partial<CvCustomSection>) {
    setContent((current) => ({
      ...current,
      customSections: current.customSections.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function addSkill() {
    const value = skillInput.trim();
    if (!value || content.skills.includes(value)) {
      setSkillInput("");
      return;
    }
    setContent((current) => ({ ...current, skills: [...current.skills, value] }));
    setSkillInput("");
  }
  function removeSkill(skill: string) {
    setContent((current) => ({ ...current, skills: current.skills.filter((s) => s !== skill) }));
  }

  function addAchievement() {
    const parts = [builder.action.trim(), builder.outcome.trim(), builder.metric.trim()].filter(Boolean);
    if (!parts.length) return;
    const bulletText = parts.join("; ");
    setContent((current) => ({
      ...current,
      experience: current.experience.length
        ? current.experience.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  bullets: [...entry.bullets, { id: newId("ach"), text: bulletText }],
                }
              : entry,
          )
        : [
            {
              id: newId("exp"),
              company: "Highlighted Achievements",
              role: "Student",
              period: "",
              bullets: [{ id: newId("ach"), text: bulletText }],
            },
          ],
    }));
    setBuilder({ action: "", outcome: "", metric: "" });
  }

  return (
    <div className="space-y-4">
      <ResumeTopbar
        documentId={documentId}
        content={content}
        templateId={templateId}
        comments={comments}
        versions={versions}
        personas={personas}
        upcomingJds={upcomingJds}
        onOpenAiAssistant={() => setAiDrawerOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Editor + Live Canvas */}
      <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#080f21] lg:flex lg:items-stretch">
        <IconRail
          content={content}
          sectionFilter={sectionFilter}
          activeKey={activeRailKey}
          onScrollToSection={scrollToSection}
        />

        <ResizablePanel>
          {isolatedKey && (
            <FocusMode activeKey={isolatedKey} sectionRefs={sectionRefs} />
          )}

          {/* Search + expand/collapse + tools */}
          <div className="space-y-2">
            <div className="relative">
              <OpsIcon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                placeholder="Search sections…"
                className={`${inputClass} pl-8`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <button type="button" data-cmd="expand-all" onClick={expandAll} className="hover:text-slate-200">Expand all</button>
              <span className="text-slate-700">·</span>
              <button type="button" data-cmd="collapse-all" onClick={collapseAll} className="hover:text-slate-200">Collapse all</button>
              {isolatedKey && (
                <>
                  <span className="text-slate-700">·</span>
                  <button type="button" onClick={() => setIsolatedKey(null)} className="hover:text-slate-200">Show all sections</button>
                </>
              )}
              <span className="ml-auto">
                <TopbarDropdown
                  align="right"
                  panelClassName="w-56 p-1.5"
                  trigger={(open) => (
                    <span className={`${topbarBtnClass} ${open ? "border-[#4f46e5]" : ""}`}>
                      <OpsIcon name="layers" size={12} />
                      More tools
                    </span>
                  )}
                >
                  <button type="button" onClick={() => setToolsDrawer("health")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-white/5">
                    <OpsIcon name="activity" size={13} />
                    CV Health Check
                  </button>
                  <button type="button" onClick={() => setToolsDrawer("find-replace")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-white/5">
                    <OpsIcon name="search" size={13} />
                    Find &amp; Replace
                  </button>
                  <button type="button" onClick={() => setToolsDrawer("diff")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-white/5">
                    <OpsIcon name="refresh" size={13} />
                    Version Diff
                  </button>
                </TopbarDropdown>
              </span>
            </div>
          </div>

          <PersonalSection
            personalInfo={content.personalInfo}
            onChange={updatePersonal}
            registerRef={(el) => registerSectionRef("personal", el)}
          />

          <AcademicsSection
            academics={content.academics}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                academics: [
                  ...c.academics,
                  { id: newId("acad"), course: "", institute: "", year: "", result: "" },
                ],
              }))
            }
            onRemove={(index) => setContent((c) => ({ ...c, academics: c.academics.filter((_, i) => i !== index) }))}
            onUpdate={updateAcademic}
            registerRef={(el) => registerSectionRef("academics", el)}
            registerDetailsRef={registerDetailsRef}
          />

          {/* Skills */}
          <section ref={(el) => registerSectionRef("skills", el)}>
            <SectionHeader title="Skills" sectionKey="skills" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <div className={cardClass}>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {content.skills.map((skill) => (
                  <span key={skill} className="flex items-center gap-1 rounded-full border border-[#334155] bg-[#1e293b] px-2.5 py-1 text-xs text-slate-200">
                    {skill}
                    <button type="button" onClick={() => removeSkill(skill)} className="text-slate-500 hover:text-red-400">
                      <OpsIcon name="x" size={10} />
                    </button>
                  </span>
                ))}
                {content.skills.length === 0 && <p className="text-xs text-slate-500">No skills added yet.</p>}
              </div>
              <div className="flex gap-2">
                <input
                  data-field={resumeFieldKey({ section: "skills", field: "skills" })}
                  value={skillInput}
                  onChange={(event) => setSkillInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } }}
                  placeholder="Type a skill and press Enter"
                  className={inputClass}
                />
                <button type="button" onClick={addSkill} className={addButtonClass}>Add</button>
              </div>
            </div>
          </section>

          <ExperienceSection
            section="experience"
            title="Internships & Professional Experience"
            addLabel="+ Add Experience"
            entryLabel="Experience"
            companyLabel="Company / Organization"
            bulletsLabel="Achievement Bullets"
            entries={content.experience}
            documentId={documentId}
            hiddenSections={content.hiddenSections}
            onToggleHidden={toggleSectionHidden}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                experience: [
                  ...c.experience,
                  { id: newId("exp"), company: "", role: "", period: "", bullets: [] },
                ],
              }))
            }
            onRemove={(index) => setContent((c) => ({ ...c, experience: c.experience.filter((_, i) => i !== index) }))}
            onMove={(index, direction) => setContent((c) => ({ ...c, experience: moveArrayItem(c.experience, index, direction) }))}
            onUpdate={(index, patch) => updateExperience("experience", index, patch)}
            registerRef={(el) => registerSectionRef("experience", el)}
            registerDetailsRef={registerDetailsRef}
          />

          <ExperienceSection
            section="positions"
            title="Positions of Responsibility"
            addLabel="+ Add Position"
            entryLabel="Position"
            companyLabel="Organization / Club"
            bulletsLabel="Bullets"
            entries={content.positions}
            documentId={documentId}
            hiddenSections={content.hiddenSections}
            onToggleHidden={toggleSectionHidden}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                positions: [
                  ...c.positions,
                  { id: newId("pos"), company: "", role: "", period: "", bullets: [] },
                ],
              }))
            }
            onRemove={(index) => setContent((c) => ({ ...c, positions: c.positions.filter((_, i) => i !== index) }))}
            onMove={(index, direction) => setContent((c) => ({ ...c, positions: moveArrayItem(c.positions, index, direction) }))}
            onUpdate={(index, patch) => updateExperience("positions", index, patch)}
            registerRef={(el) => registerSectionRef("positions", el)}
            registerDetailsRef={registerDetailsRef}
          />

          <ProjectsSection
            projects={content.projects}
            documentId={documentId}
            hiddenSections={content.hiddenSections}
            onToggleHidden={toggleSectionHidden}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                projects: [
                  ...c.projects,
                  { id: newId("proj"), name: "", role: "", period: "", link: "", bullets: [] },
                ],
              }))
            }
            onRemove={(index) => setContent((c) => ({ ...c, projects: c.projects.filter((_, i) => i !== index) }))}
            onMove={(index, direction) => setContent((c) => ({ ...c, projects: moveArrayItem(c.projects, index, direction) }))}
            onUpdate={updateProject}
            registerRef={(el) => registerSectionRef("projects", el)}
            registerDetailsRef={registerDetailsRef}
          />

          <LanguagesSection
            languages={content.languages}
            hiddenSections={content.hiddenSections}
            onToggleHidden={toggleSectionHidden}
            onAdd={() => setContent((c) => ({ ...c, languages: [...c.languages, { id: newId("lang"), name: "", level: "" }] }))}
            onRemove={(index) => setContent((c) => ({ ...c, languages: c.languages.filter((_, i) => i !== index) }))}
            onUpdate={updateLanguage}
            registerRef={(el) => registerSectionRef("languages", el)}
          />

          {/* Certifications */}
          <section ref={(el) => registerSectionRef("certifications", el)}>
            <SectionHeader title="Certifications" sectionKey="certifications" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <StringListEditor
              items={content.certifications}
              onChange={(items) => setContent((c) => ({ ...c, certifications: items }))}
              placeholder="e.g. Google Data Analytics"
            />
          </section>

          {/* Awards */}
          <section ref={(el) => registerSectionRef("awards", el)}>
            <SectionHeader title="Awards & Achievements" sectionKey="awards" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <StringListEditor
              items={content.awards}
              onChange={(items) => setContent((c) => ({ ...c, awards: items }))}
              placeholder="e.g. Dean's List, 2024"
            />
          </section>

          {/* Activities */}
          <section ref={(el) => registerSectionRef("activities", el)}>
            <SectionHeader title="Extracurricular Activities" sectionKey="activities" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <StringListEditor
              items={content.activities}
              onChange={(items) => setContent((c) => ({ ...c, activities: items }))}
              placeholder="e.g. Captain, college football team"
            />
          </section>

          {/* Hobbies */}
          <section ref={(el) => registerSectionRef("hobbies", el)}>
            <SectionHeader title="Hobbies & Interests" sectionKey="hobbies" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <StringListEditor
              items={content.hobbies}
              onChange={(items) => setContent((c) => ({ ...c, hobbies: items }))}
              placeholder="e.g. Chess, Long-distance running"
            />
          </section>

          <PublicationsSection
            publications={content.publications}
            hiddenSections={content.hiddenSections}
            onToggleHidden={toggleSectionHidden}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                publications: [...c.publications, { id: newId("pub"), title: "", publisher: "", date: "", link: "" }],
              }))
            }
            onRemove={(index) => setContent((c) => ({ ...c, publications: c.publications.filter((_, i) => i !== index) }))}
            onUpdate={updatePublication}
            registerRef={(el) => registerSectionRef("publications", el)}
            registerDetailsRef={registerDetailsRef}
          />

          <CustomSectionsSection
            customSections={content.customSections}
            documentId={documentId}
            hiddenSections={content.hiddenSections}
            onToggleHidden={toggleSectionHidden}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                customSections: [...c.customSections, { id: newId("custom"), title: "", items: [] }],
              }))
            }
            onRemove={(index) => setContent((c) => ({ ...c, customSections: c.customSections.filter((_, i) => i !== index) }))}
            onUpdate={updateCustomSection}
            registerRef={(el) => registerSectionRef("customSections", el)}
            registerDetailsRef={registerDetailsRef}
          />

          <div ref={(el) => registerSectionRef("achievementBuilder", el)}>
            <AchievementBuilderSection
              builder={builder}
              onFieldChange={(field, value) => setBuilder((b) => ({ ...b, [field]: value }))}
              onSubmit={addAchievement}
            />
          </div>
        </ResizablePanel>

        <PreviewCanvas
          content={content}
          templateId={templateId}
          onTemplateChange={(id) => setTemplateId(normalizeCvTemplateId(id))}
          zoom={zoom}
          onZoomChange={setZoom}
          onFitZoom={fitZoom}
          canvasWrapperRef={canvasWrapperRef}
          onFieldClick={handleFieldClick}
        />
      </div>

      {commandPaletteOpen && <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />}

      {aiDrawerOpen && (
        <RightDrawer open={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} title="AI Resume Assistant">
          <ResumeAiAssistant
            documentId={documentId}
            content={content}
            onApplyBullet={(bullet) => {
              setContent((current) => ({
                ...current,
                experience: current.experience.length
                  ? current.experience.map((entry, index) =>
                      index === 0
                        ? {
                            ...entry,
                            bullets: [...entry.bullets, { id: newId("ai"), text: bullet }],
                          }
                        : entry,
                    )
                  : [
                      {
                        id: newId("exp"),
                        company: "Experience",
                        role: "Role",
                        period: "",
                        bullets: [{ id: newId("ai"), text: bullet }],
                      },
                    ],
              }));
            }}
            onApplyImported={(imported) => setContent(imported)}
          />
        </RightDrawer>
      )}

      {toolsDrawer === "health" && (
        <RightDrawer open onClose={() => setToolsDrawer(null)} title="CV Health Check">
          <CvHealthPanel content={content} />
        </RightDrawer>
      )}
      {toolsDrawer === "find-replace" && (
        <RightDrawer open onClose={() => setToolsDrawer(null)} title="Find & Replace">
          <FindReplacePanel content={content} onApply={setContent} />
        </RightDrawer>
      )}
      {toolsDrawer === "diff" && (
        <RightDrawer open onClose={() => setToolsDrawer(null)} title="Version Diff">
          <VersionDiffPanel versions={versions} currentDocumentId={documentId} />
        </RightDrawer>
      )}
    </div>
  );
}
