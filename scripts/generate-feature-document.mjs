import fs from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const root = process.cwd();
const screenshots = path.join(root, "docs", "screenshots");
const output = path.join(root, "docs", "PlacementOS-Feature-Documentation.docx");

const colors = {
  ink: "17324D",
  teal: "0B7285",
  mint: "DFF3F1",
  pale: "F4F7F8",
  line: "CBD5DA",
  amber: "FFF3CD",
  red: "FDE8E7",
  white: "FFFFFF",
};

const screenData = {
  auth: [
    ["01-login.png", "Login", "Logged out", "Shared sign-in entry point for students, recruiters, SPC users, and administrators."],
    ["02-signup.png", "Recruiter registration", "Logged out", "Corporate recruiter self-registration, followed by administrative approval."],
    ["03-dashboard-pending.png", "Pending approval", "Pending Recruiter", "A pending recruiter sees the approval state and does not receive active permissions."],
  ],
  governance: [
    ["04-dashboard.png", "Role-aware dashboard", "Admin", "Administrative home with active placement-season context and permission-aware navigation."],
    ["23-admin-users.png", "User management", "Admin", "Approve or reject users, activate or deactivate accounts, and assign roles or permission sets."],
    ["24-admin-roles.png", "Role management", "Admin", "Clone custom roles and manage permission bundles while system roles remain locked."],
    ["25-admin-roster.png", "Batch and roster setup", "Admin", "Create or reactivate dated seasons and stage roster profile-sheet imports for review."],
    ["26-admin-audit-log.png", "Audit log", "Admin", "Read-only event history for approvals, overrides, status changes, and sensitive administration."],
  ],
  jd: [
    ["05-jds-list.png", "JD library", "Admin", "Active-season job descriptions are separated from historical, reusable templates."],
    ["06-jd-new.png", "Create a JD", "Admin", "Capture role, compensation, deadline, batch, and eligibility criteria in one workflow."],
    ["07-jd-detail.png", "JD detail and release", "Admin", "Review structured JD information, live eligibility counts, status, and attachments."],
    ["08-jd-eligibility.png", "Eligibility review", "Admin", "Inspect the qualified cohort and apply explicit include or exclude overrides."],
  ],
  student: [
    ["09-jobs-student.png", "Student job portal", "Student", "Published opportunities show batch eligibility and a one-click application path."],
    ["10-applications-student.png", "My applications", "Student", "Track current application statuses and withdraw before the deadline where allowed."],
    ["17-defaults-student.png", "Student defaults view", "Student", "Read-only attendance and defaults totals with activity-level status."],
  ],
  recruiter: [
    ["12-applicants-recruiter.png", "Applicant directory", "Recruiter", "Search, filter, sort, evaluate, and act on candidates for a recruiter-owned JD."],
    ["12a-masked.png", "Applicant privacy state", "Recruiter", "Evidence screen retained from the capture set; the manifest flags that no masked pre-shortlist row rendered in this run."],
    ["12b-unmasked.png", "Shortlisted contact state", "Recruiter", "Shortlisting unlocks the permitted phone and email fields for the relevant application."],
    ["12c-bulk-shortlist.png", "Bulk candidate actions", "Recruiter", "Select up to 500 candidates for atomic shortlist, waitlist, or reject actions with an optional round label."],
    ["13-applicant-packets.png", "Candidate packets", "Recruiter", "Combine the roster Profile Sheet and exact application-time CV snapshot for review or merged printing."],
  ],
  spc: [
    ["11-spc-dashboard.png", "SPC pipeline dashboard", "SPC", "Monitor active hiring pipelines, latest interview rounds, counts, and stale activity."],
  ],
  defaults: [
    ["16-defaults-admin.png", "Defaults administration", "Admin", "Import attendance/default CSVs, review the staged data, and configure the threshold used by eligibility."],
  ],
  reports: [
    ["18-reports-dashboard.png", "Reports dashboard", "Admin", "View placed/unplaced counts, placement rate, CTC statistics, company breakdown, and season comparison."],
    ["19-reports-export.png", "Reports export", "Admin", "Choose an official wide, accreditation, or PII-free public company summary export."],
  ],
  outreach: [
    ["14-companies-kanban.png", "Outreach Kanban", "Admin", "Track target companies through a five-stage corporate outreach pipeline."],
    ["14b-kanban-drag.png", "Kanban interaction evidence", "Admin", "Capture-set evidence for a requested drag/stage-change affordance; the manifest records that it is not implemented."],
    ["15-company-detail.png", "Company detail hub", "Admin", "Manage contacts, owners, supervisor, JD Form Received, persona previews, and activity remarks."],
  ],
  resume: [
    ["20-resume-list.png", "Resume Maker", "Student", "Create persona-specific CV versions, select a JD, and inspect transparent keyword coverage."],
    ["21-resume-editor.png", "Resume editor and export", "Student", "Edit placement-cell sections with a live preview and export through print/PDF or genuine OOXML DOCX."],
    ["22-resume-review.png", "Resume review", "SPC", "Add section or bullet comments; students can mark each comment Applied or Dismissed."],
  ],
};

const modules = [
  {
    title: "1. Authentication, onboarding, and access control",
    purpose: "Provide a single entry point for every persona while enforcing approval and permission boundaries at both the UI and database layers.",
    capabilities: [
      "Email/password login for Admin, SPC, recruiter, and student accounts.",
      "Recruiter self-registration with a Pending state until Admin approval.",
      "Five base roles, granular permission sets, custom-role cloning, account activation controls, and tenant-scoped assignments.",
      "Immutable, read-only audit history for high-impact actions.",
    ],
    workflow: "A recruiter registers, remains pending, and is then approved by an Admin. Once active, role-aware navigation exposes only the surfaces the account can use. Administrative changes are logged for later review.",
    screens: "auth",
    status: "Implemented in code; real pilot identity/SSO integration remains open.",
  },
  {
    title: "2. Job descriptions and eligibility",
    purpose: "Move a job from structured intake through publication and candidate eligibility review.",
    capabilities: [
      "Draft, publish, and review job descriptions with company, role, compensation, deadline, batch, and eligibility rules.",
      "Live eligible-candidate count before publication.",
      "SQL-backed checks for batch, branch, specialization, CGPA, backlogs, placement status, and defaults.",
      "Admin include/exclude overrides that are batch-scoped and audit-aware.",
      "Historical JD templates can be cloned into the active season without copying applications or status history.",
    ],
    workflow: "An authorized user creates a JD, reviews the computed cohort, applies any explicit overrides, and releases the opportunity through the configured workflow. Students then see the published opportunity only when the batch and eligibility rules permit it.",
    screens: "jd",
    status: "Implemented in code; notification delivery and full real-data reconciliation remain pilot work.",
  },
  {
    title: "3. Student applications",
    purpose: "Give students a low-friction, self-service application experience while preserving the exact CV used at submission time.",
    capabilities: [
      "Published-job browsing scoped to the student’s batch.",
      "Per-criterion eligibility self-check with human-readable reasons.",
      "One-click apply and live My Applications status tracking.",
      "Withdrawal before the JD deadline.",
      "Immutable application-time CV snapshot for downstream recruiter and SPC review.",
    ],
    workflow: "The student opens a published JD, reviews eligibility reasons, applies with the current CV, and follows status changes from the applications tracker. The application retains the CV version that existed at submission rather than silently changing later.",
    screens: "student",
    status: "Implemented in code; real three-employer profile and source-data validation remain open.",
  },
  {
    title: "4. Recruiter shortlisting and candidate packets",
    purpose: "Give recruiters practical applicant operations while limiting personal data until the relevant shortlist decision exists.",
    capabilities: [
      "Name/roll search, status/branch/specialization/CGPA/work-ex filters, and sorting.",
      "Per-candidate and atomic bulk shortlist, waitlist, or reject actions for up to 500 selected candidates.",
      "Optional round labels and interview-round history.",
      "Profile Sheet plus attached application-time CV packet, with merged print support.",
      "Database-side masking boundary for pre-shortlist contact and CV fields; permitted fields unlock after shortlist.",
    ],
    workflow: "A recruiter works from the applicant directory, filters the cohort, selects candidates, and records a decision. Candidate packets expose only the information allowed for the current application status and company scope.",
    screens: "recruiter",
    status: "Implemented in code; the capture set contains a documented masked-row evidence limitation that should be recaptured after the masking workflow is demonstrated in a live browser session.",
  },
  {
    title: "5. SPC coordination and interview rounds",
    purpose: "Help placement coordinators see where every active hiring pipeline stands and schedule the next candidate round.",
    capabilities: [
      "Active pipeline overview excluding closed JDs.",
      "Shortlisted versus total applicant counts and staleness flags.",
      "Round name, date/time, room or link, and latest-round visibility.",
      "Student/SPC notifications are represented by the notification queue, with provider configuration still required for delivery.",
    ],
    workflow: "The SPC opens the coordination dashboard, identifies stale or active pipelines, assigns interview details from the applicant workflow, and uses the latest round state to coordinate follow-up.",
    screens: "spc",
    status: "Implemented in code; live email provider configuration and reminder timing need pilot validation.",
  },
  {
    title: "6. Defaults tracker",
    purpose: "Turn attendance and compliance records into a transparent, reusable eligibility input.",
    capabilities: [
      "Admin CSV staging, row review, and re-import/upsert support.",
      "Activity-level records rolled into a student defaults summary.",
      "Configurable threshold used by the eligibility engine.",
      "Student read-only view of totals and attended/default status.",
    ],
    workflow: "Admin imports and verifies the source tracker, sets the threshold, and the eligibility engine uses that value for JD checks. Students can inspect their own result without editing institute-managed records.",
    screens: "defaults",
    status: "Implemented in code; full-batch reconciliation against institute source data remains open.",
  },
  {
    title: "7. Placement reports and exports",
    purpose: "Provide operational and accreditation-ready views of placement outcomes without requiring manual spreadsheet assembly.",
    capabilities: [
      "Placed/unplaced counts, placement rate, average/median/highest CTC, and company breakdown.",
      "Current-versus-baseline season comparison when multiple populated seasons exist.",
      "Official wide final-placement datasheet export with four columns per company.",
      "Accreditation detail export and PII-free public company summary.",
      "Separate placement confirmation step gated to Admin/SPC.",
    ],
    workflow: "Admin or SPC confirms a final placement, the reports dashboard aggregates the outcome, and an authorized user chooses the export audience and template. Unknown dates remain blank rather than being fabricated.",
    screens: "reports",
    status: "Implemented in code; official reconciliation against all historical source records remains open.",
  },
  {
    title: "8. Outreach CRM",
    purpose: "Give the placement cell a structured operating surface for company targeting, relationship ownership, and outreach history.",
    capabilities: [
      "Five-stage Kanban pipeline for target companies.",
      "Staged/reviewed target-company CSV import with duplicate and header validation.",
      "Contact directory with title, full name, last name, designation, email, cc email, and phone.",
      "Owner and supervisor assignment, JD Form Received flag, persona templates, and editable preview.",
      "Separate call remarks and SPC remarks with chronological activity history.",
    ],
    workflow: "The placement cell imports or creates a target company, assigns operational owners, records contacts and remarks, selects a persona template, and logs outreach activity. The current product deliberately logs outreach rather than claiming to send email.",
    screens: "outreach",
    status: "Implemented in code; live sending, deliverability monitoring, scheduled sends, and Vault storage remain partial or open.",
  },
  {
    title: "9. Resume Maker and review",
    purpose: "Let students create accurate, role-specific placement CVs and let the placement committee give actionable feedback.",
    capabilities: [
      "Multiple persona-specific CV versions with first-version roster prefilling.",
      "Editable placement-cell layout, achievement builder, and live preview.",
      "Transparent keyword coverage against a selected JD.",
      "Placement Cell Classic, Modern Blue, and Compact Executive layouts.",
      "Browser Print/Save PDF and genuine selectable-text OOXML DOCX export.",
      "SPC/Admin inline comments with Applied/Dismissed student actions.",
    ],
    workflow: "The student creates or selects a CV version, edits structured sections, checks fit against a JD, and exports the document. SPC/Admin reviewers add comments in the review workbench; the student closes each comment explicitly.",
    screens: "resume",
    status: "Implemented in code; configured AI provider, binary import, and ATS validation remain future work.",
  },
];

function text(value, options = {}) {
  return new TextRun({ font: "Aptos", size: options.size ?? 20, color: options.color ?? colors.ink, bold: options.bold, italics: options.italics, text: value });
}

function paragraph(children, options = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [text(children, options)],
    spacing: { after: options.after ?? 140, line: 276 },
    alignment: options.alignment,
    heading: options.heading,
    pageBreakBefore: options.pageBreakBefore,
  });
}

function bullet(value) {
  return new Paragraph({
    children: [text(value)],
    bullet: { level: 0 },
    spacing: { after: 80, line: 260 },
  });
}

function cell(value, options = {}) {
  return new TableCell({
    shading: { fill: options.fill ?? colors.white, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [paragraph(value, { size: 17, bold: options.bold, color: options.color, after: 0 })],
  });
}

function statusTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: colors.line }, bottom: { style: BorderStyle.SINGLE, size: 4, color: colors.line }, insideH: { style: BorderStyle.SINGLE, size: 2, color: colors.line }, insideV: { style: BorderStyle.SINGLE, size: 2, color: colors.line } },
    rows: [
      new TableRow({ children: [cell("Status", { fill: colors.ink, color: colors.white, bold: true }), cell("Meaning", { fill: colors.ink, color: colors.white, bold: true })] }),
      ...rows.map(([status, meaning, fill]) => new TableRow({ children: [cell(status, { fill, bold: true }), cell(meaning, { fill })] })),
    ],
  });
}

async function imageParagraph(filename, caption) {
  const image = await fs.readFile(path.join(screenshots, filename));
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 60 },
      children: [new ImageRun({ data: image, transformation: { width: 620, height: 388 }, type: "png" })],
    }),
    paragraph([text(`${filename}  `, { bold: true, size: 16, color: colors.teal }), text(caption, { size: 16, italics: true, color: "52616B" })], { alignment: AlignmentType.CENTER, after: 200 }),
  ];
}

async function screenSection(key) {
  const items = screenData[key] ?? [];
  const output = [];
  for (const [filename, title, role, description] of items) {
    output.push(...await imageParagraph(filename, `${title} | ${role} | ${description}`));
  }
  return output;
}

async function build() {
  const children = [
    paragraph("PlacementOS", { size: 42, bold: true, color: colors.ink, after: 60 }),
    paragraph("Detailed Feature Documentation", { size: 30, bold: true, color: colors.teal, after: 260 }),
    paragraph("Implementation-aligned product and workflow guide", { size: 19, italics: true, color: "52616B", after: 80 }),
    paragraph("Prepared 22 August 2026", { size: 17, color: "52616B", after: 320 }),
    paragraph("Purpose", { heading: HeadingLevel.HEADING_1, color: colors.teal }),
    paragraph("This document describes the PlacementOS baseline currently implemented in the workspace. It is written for product review, stakeholder walkthroughs, pilot preparation, and engineering handover. Screens are embedded from the actual implementation capture set in docs/screenshots, not mockups.", { after: 180 }),
    paragraph("Evidence note", { heading: HeadingLevel.HEADING_2, color: colors.teal }),
    paragraph("The screenshots were captured with Playwright Chromium at a 1440 x 900 viewport in dark theme mode. The data is seeded screenshot-demo data and is visibly labeled in the application. The screenshot manifest remains the authoritative route/persona/caption index; two capture-set limitations are preserved here rather than presented as completed behavior.", { after: 220 }),
    paragraph("At a glance", { heading: HeadingLevel.HEADING_1, color: colors.teal }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cell("Product", { fill: colors.mint, bold: true }), cell("PlacementOS - placement process digitization for premium B-Schools")]}),
        new TableRow({ children: [cell("Primary users", { fill: colors.pale, bold: true }), cell("Admin, SPC, recruiter, student")]}),
        new TableRow({ children: [cell("Implemented baseline", { fill: colors.mint, bold: true }), cell("All ten BRD modules have a working baseline UI")]}),
        new TableRow({ children: [cell("Current implementation record", { fill: colors.pale, bold: true }), cell("39 Implemented, 19 Partial, 1 Missing functional requirements")]}),
        new TableRow({ children: [cell("Capture inventory", { fill: colors.mint, bold: true }), cell("26 actual screens, including authentication, operations, reporting, CRM, resume, and administration")]}),
      ],
    }),
    paragraph("Document navigation", { heading: HeadingLevel.HEADING_1, color: colors.teal, pageBreakBefore: true }),
    paragraph("The feature chapters follow the operational lifecycle: access, JD intake, student application, recruiter evaluation, SPC coordination, compliance, outcomes, outreach, and resume review. Each chapter includes purpose, capabilities, workflow, implementation status, and embedded screen evidence.", { after: 160 }),
    paragraph("Status vocabulary", { heading: HeadingLevel.HEADING_2, color: colors.teal }),
    statusTable([
      ["Implemented", "The user-visible behavior exists end to end in code; pilot or real-data validation may still be outstanding.", colors.mint],
      ["Partial", "Only part of the requirement exists, or provider/configuration/validation work remains.", colors.amber],
      ["Missing", "No usable implementation of the requirement exists in the current baseline.", colors.red],
    ]),
  ];

  for (const featureModule of modules) {
    children.push(paragraph(featureModule.title, { heading: HeadingLevel.HEADING_1, color: colors.teal, pageBreakBefore: true }));
    children.push(paragraph([text("Purpose: ", { bold: true }), text(featureModule.purpose)]));
    children.push(paragraph("Capabilities", { heading: HeadingLevel.HEADING_2, color: colors.teal }));
    children.push(...featureModule.capabilities.map(bullet));
    children.push(paragraph("Primary workflow", { heading: HeadingLevel.HEADING_2, color: colors.teal }));
    children.push(paragraph(featureModule.workflow));
    children.push(paragraph("Implementation status", { heading: HeadingLevel.HEADING_2, color: colors.teal }));
    children.push(paragraph(featureModule.status, { after: 200 }));
    children.push(paragraph("Actual screens", { heading: HeadingLevel.HEADING_2, color: colors.teal }));
    children.push(...await screenSection(featureModule.screens));
  }

  children.push(
    paragraph("Cross-cutting controls and limitations", { heading: HeadingLevel.HEADING_1, color: colors.teal, pageBreakBefore: true }),
    paragraph("Security and privacy", { heading: HeadingLevel.HEADING_2, color: colors.teal }),
    ...[
      "The data model is tenant-scoped through institute_id and RLS policies.",
      "Recruiter applicant views use a database-side masking boundary for contact and CV-related fields until shortlist conditions are met.",
      "Admin and SPC placement confirmation is intentionally separate from a recruiter selecting a candidate.",
      "The audit log is read-only by construction, and sensitive administration is wired to audit events.",
    ].map(bullet),
    paragraph("Known limitations", { heading: HeadingLevel.HEADING_2, color: colors.teal }),
    ...[
      "Institute SSO is not integrated; Supabase email/password is the current stand-in.",
      "Supabase Storage is not wired for JD attachments, CV files, or the Placement Committee Vault.",
      "Resend delivery is not fully configured; outreach is explicitly logged rather than sent.",
      "Resume AI rewriting and binary PDF/DOCX import require a configured provider and additional controls.",
      "Some requirements still need real Postgres, historical source-data, recruiter, and pilot acceptance validation.",
    ].map(bullet),
    paragraph("Capture-set caveats", { heading: HeadingLevel.HEADING_2, color: colors.teal }),
    paragraph("12a-masked.png is retained because it is part of the evidence set, but its manifest entry states that the standard Recruiter run omitted a pre-shortlist masked row. 14b-kanban-drag.png likewise records the requested drag/stage-change interaction as not implemented. These are documented limitations, not evidence of a completed interaction.", { after: 220 }),
    paragraph("End-to-end lifecycle", { heading: HeadingLevel.HEADING_1, color: colors.teal, pageBreakBefore: true }),
    paragraph("The implemented baseline supports this operational loop:", { after: 120 }),
    ...[
      "1. Admin creates the active batch and stages the student roster.",
      "2. Recruiter registers, receives approval, and creates a deadline-bearing JD.",
      "3. Authorized placement staff review eligibility and release the opportunity.",
      "4. Student checks eligibility, applies with the current CV, and tracks the application.",
      "5. Recruiter filters candidates, shortlists in bulk or individually, and opens permitted packets.",
      "6. SPC schedules rounds, watches stale pipelines, and coordinates follow-up.",
      "7. Admin/SPC confirms final placements; Reports aggregates and exports outcomes.",
      "8. The placement cell manages company outreach and students iterate on reviewed CVs.",
    ].map((item) => paragraph(item, { after: 85 })),
    paragraph("Appendix: screen index", { heading: HeadingLevel.HEADING_1, color: colors.teal, pageBreakBefore: true }),
    paragraph("Every screenshot below is embedded from docs/screenshots and maps to an implemented route in the screenshot manifest.", { after: 160 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cell("File", { fill: colors.ink, color: colors.white, bold: true }), cell("Feature evidence", { fill: colors.ink, color: colors.white, bold: true })] }),
        ...Object.values(screenData).flat().map(([filename, title, role, description], index) => new TableRow({ children: [cell(`${index + 1}. ${filename}`, { fill: index % 2 ? colors.pale : colors.white, bold: true }), cell(`${title} - ${role}. ${description}`, { fill: index % 2 ? colors.pale : colors.white })] })),
      ],
    }),
    paragraph("Source files", { heading: HeadingLevel.HEADING_1, color: colors.teal, pageBreakBefore: true }),
    ...[
      "README.md - current product scope and known gaps.",
      "docs/BRD-IMPLEMENTATION-STATUS.md - BRD-to-code traceability and requirement statuses.",
      "docs/screenshots/manifest.md - route, persona, description, and capture status for every screenshot.",
      "docs/screenshots/*.png - actual implementation screens embedded in this document.",
    ].map((item) => paragraph(item, { after: 90 })),
  );

  const document = new Document({
    creator: "PlacementOS",
    title: "PlacementOS Detailed Feature Documentation",
    subject: "Implemented feature documentation with actual UI screenshots",
    description: "PlacementOS feature and workflow guide",
    styles: {
      default: { document: { run: { font: "Aptos", size: 20, color: colors.ink }, paragraph: { spacing: { line: 276 } } } },
      title: { run: { font: "Aptos Display", size: 42, bold: true, color: colors.ink } },
      heading1: { run: { font: "Aptos Display", size: 30, bold: true, color: colors.teal }, paragraph: { spacing: { before: 260, after: 140 } } },
      heading2: { run: { font: "Aptos", size: 23, bold: true, color: colors.teal }, paragraph: { spacing: { before: 180, after: 100 } } },
    },
    sections: [{
      properties: {
        page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [text("PlacementOS | Feature Documentation", { size: 15, color: "70818A" })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text("Implementation-aligned guide | 22 August 2026", { size: 15, color: "70818A" })] })] }) },
      children,
    }],
  });

  await fs.writeFile(output, await Packer.toBuffer(document));
  console.log(`Created ${output}`);
}

await build();