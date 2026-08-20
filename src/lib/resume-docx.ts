import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { normalizeCvTemplateId } from "@/lib/resume-templates";
import type { CvContent, CvExperienceEntry, CvProjectEntry } from "@/types/domain";

function sectionHeading(text: string, color: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color, size: 20 })],
  });
}

function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 40 } });
}

function experienceParagraph(row: CvExperienceEntry) {
  return new Paragraph({
    spacing: { before: 80, after: 40 },
    children: [
      new TextRun({ text: row.company || row.role, bold: true }),
      new TextRun({ text: row.company && row.role ? ` — ${row.role}` : "" }),
      new TextRun({ text: row.period ? `  |  ${row.period}` : "", color: "64748B" }),
    ],
  });
}

function projectParagraph(row: CvProjectEntry) {
  return new Paragraph({
    spacing: { before: 80, after: 40 },
    children: [
      new TextRun({ text: row.name || row.role, bold: true }),
      new TextRun({ text: row.name && row.role ? ` — ${row.role}` : "" }),
      new TextRun({ text: row.period ? `  |  ${row.period}` : "", color: "64748B" }),
    ],
  });
}

export async function buildResumeDocx(content: CvContent, suppliedTemplateId: string): Promise<Blob> {
  const templateId = normalizeCvTemplateId(suppliedTemplateId);
  const accent = templateId === "modern-blue-v1" ? "1D4ED8" : templateId === "compact-executive-v1" ? "334155" : "0F172A";
  const compact = templateId === "compact-executive-v1";
  const children: Paragraph[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: templateId === "placement-cell-v2" ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 60 },
    children: [new TextRun({ text: content.personalInfo.name || "Candidate", bold: true, color: accent, size: compact ? 30 : 36 })],
  }));
  children.push(new Paragraph({
    alignment: templateId === "placement-cell-v2" ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 100 },
    children: [new TextRun({
      text: [content.personalInfo.phone, content.personalInfo.email, content.personalInfo.linkedin, content.personalInfo.location].filter(Boolean).join("  |  "),
      color: "475569",
      size: 18,
    })],
  }));
  if (content.personalInfo.summary) children.push(new Paragraph({ text: content.personalInfo.summary, spacing: { after: 100 } }));

  if (content.academics.length) {
    children.push(sectionHeading("Academic Performance Record", accent));
    for (const row of content.academics) {
      children.push(new Paragraph({
        spacing: { after: 50 },
        children: [
          new TextRun({ text: row.institute || row.course, bold: true }),
          new TextRun({ text: row.institute && row.course ? ` — ${row.course}` : "" }),
          new TextRun({ text: [row.year, row.result].filter(Boolean).length ? `  |  ${[row.year, row.result].filter(Boolean).join("  |  ")}` : "", color: "64748B" }),
        ],
      }));
    }
  }

  if (content.projects.length) {
    children.push(sectionHeading("Projects", accent));
    for (const row of content.projects) {
      children.push(projectParagraph(row));
      if (row.link) children.push(new Paragraph({ text: row.link, spacing: { after: 40 }, style: "IntenseQuote" }));
      children.push(...row.bullets.filter((item) => item.text).map((item) => bullet(item.text)));
    }
  }

  for (const [title, rows] of [["Positions of Responsibility", content.positions], ["Internships / Work Experience", content.experience]] as const) {
    if (!rows.length) continue;
    children.push(sectionHeading(title, accent));
    for (const row of rows) {
      children.push(experienceParagraph(row));
      children.push(...row.bullets.filter((item) => item.text).map((item) => bullet(item.text)));
    }
  }

  for (const [title, values] of [["Skills", content.skills], ["Certifications", content.certifications], ["Awards & Achievements", content.awards]] as const) {
    if (!values.length) continue;
    children.push(sectionHeading(title, accent));
    if (title === "Skills") children.push(new Paragraph({ text: values.join("  •  ") }));
    else children.push(...values.map((value) => bullet(value)));
  }

  const document = new Document({
    styles: { default: { document: { run: { font: "Aptos", size: compact ? 19 : 20 }, paragraph: { spacing: { line: compact ? 250 : 276 } } } } },
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children,
    }],
  });
  return Packer.toBlob(document);
}
