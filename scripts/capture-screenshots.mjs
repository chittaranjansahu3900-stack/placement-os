import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OUTPUT_DIR = path.resolve(process.cwd(), "docs/screenshots");
const MANIFEST_ORDER = [
  "01-login.png", "02-signup.png", "03-dashboard-pending.png", "04-dashboard.png",
  "05-jds-list.png", "06-jd-new.png", "07-jd-detail.png", "08-jd-eligibility.png",
  "09-jobs-student.png", "10-applications-student.png", "11-spc-dashboard.png",
  "12-applicants-recruiter.png", "12a-masked.png", "12b-unmasked.png",
  "12c-bulk-shortlist.png", "13-applicant-packets.png", "14-companies-kanban.png",
  "14b-kanban-drag.png", "15-company-detail.png", "16-defaults-admin.png",
  "17-defaults-student.png", "18-reports-dashboard.png", "19-reports-export.png",
  "20-resume-list.png", "21-resume-editor.png", "22-resume-review.png",
  "23-admin-users.png", "24-admin-roles.png", "25-admin-roster.png",
  "26-admin-audit-log.png",
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const screenshotPassword = process.env.SCREENSHOT_TEST_PASSWORD;

if (!supabaseUrl || !supabaseKey || !screenshotPassword) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SCREENSHOT_TEST_PASSWORD",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ROLES = {
  admin: { email: "admin@iimraipur.ac.in", password: screenshotPassword, roleName: "Admin" },
  spc: { email: "spc@iimraipur.ac.in", password: screenshotPassword, roleName: "SPC" },
  recruiter: { email: "recruiter@google.com", password: screenshotPassword, roleName: "Recruiter" },
  pending: { email: "pending@startup.com", password: screenshotPassword, roleName: "Pending Recruiter" },
  student: { email: "student@iimraipur.ac.in", password: screenshotPassword, roleName: "Student" },
};

async function login(page, email, password) {
  console.log(`Logging in as ${email}...`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle");
}

async function captureScreen(page, route, filename, options = {}) {
  const targetUrl = route.startsWith("http") ? route : `${BASE_URL}${route}`;
  console.log(`📸 Capturing ${filename} from ${route}...`);
  
  const response = await page.goto(targetUrl, { waitUntil: "networkidle" });
  if (response && response.status() >= 400) {
    throw new Error(`${route} returned HTTP ${response.status()}`);
  }
  if (options.waitForSelector) {
    await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
  }
  if (options.action) {
    await options.action(page);
  }
  await page.waitForTimeout(500); // allow transitions to finish

  const outputPath = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: outputPath, fullPage: options.fullPage !== false });
  console.log(` Saved ${filename}`);
  return { filename, route, success: true };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // 1. Fetch dynamic IDs from DB
  console.log("Fetching dynamic entity IDs from database...");
  const { data: jds } = await supabase
    .from("jds")
    .select("id, role_title, status, companies(name)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const publishedJd = jds?.find((j) => j.companies?.name?.includes("Google")) || jds?.[0];
  if (!publishedJd) {
    throw new Error("No published JD found in database. Run seed script first.");
  }
  const jdId = publishedJd.id;
  console.log(`Using published JD ID: ${jdId} (${publishedJd.role_title})`);

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .order("created_at", { ascending: false });

  const targetCompany = companies?.find((c) => c.name.includes("Google")) || companies?.[0];
  if (!targetCompany) {
    throw new Error("No company found in database. Run seed script first.");
  }
  const companyId = targetCompany.id;
  console.log(`Using Company ID: ${companyId} (${targetCompany.name})`);

  const { data: screenshotUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", ROLES.student.email)
    .maybeSingle();

  const { data: screenshotStudent } = screenshotUser
    ? await supabase
        .from("students")
        .select("id")
        .eq("user_id", screenshotUser.id)
        .maybeSingle()
    : { data: null };

  const { data: cvDocs } = await supabase
    .from("cv_documents")
    .select("id, version_no")
    .eq("student_id", screenshotStudent?.id ?? "")
    .order("updated_at", { ascending: false });

  const targetCv = cvDocs?.[0];
  if (!targetCv) {
    throw new Error(`No CV document found for ${ROLES.student.email}. Run seed script first.`);
  }
  const cvId = targetCv.id;
  console.log(`Using CV Document ID: ${cvId}`);

  const browser = await chromium.launch({ headless: true });

  const manifest = [];

  // Helper for isolated role sessions
  async function runRoleSession(roleKey, tasks) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "dark",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    if (roleKey) {
      const credentials = ROLES[roleKey];
      await login(page, credentials.email, credentials.password);
    }

    for (const task of tasks) {
      try {
        await captureScreen(page, task.route, task.filename, task.options);
        manifest.push({
          filename: task.filename,
          route: task.route,
          role: task.role,
          description: task.description,
          status: task.captureStatus ?? "Success",
        });
      } catch (err) {
        console.error(`❌ Failed capturing ${task.filename}:`, err.message);
        manifest.push({
          filename: task.filename,
          route: task.route,
          role: task.role,
          description: task.description,
          status: `Error: ${err.message}`,
        });
      }
    }

    await context.close();
  }

  // Group 1: Logged Out
  await runRoleSession(null, [
    {
      filename: "01-login.png",
      route: "/login",
      role: "Logged out",
      description: "Sign-in portal for students, recruiters, coordinators, and administrators",
      options: { waitForSelector: 'input[name="email"]' },
    },
    {
      filename: "02-signup.png",
      route: "/signup",
      role: "Logged out",
      description: "Recruiter corporate self-registration portal for company onboarding",
      options: { waitForSelector: 'input[name="company"]' },
    },
  ]);

  // Group 2: Pending Recruiter
  await runRoleSession("pending", [
    {
      filename: "03-dashboard-pending.png",
      route: "/dashboard",
      role: "Pending Recruiter",
      description: "Dashboard view for newly registered recruiter waiting on CDPO administrative approval",
      options: { waitForSelector: "text=Waiting on approval" },
    },
  ]);

  // Group 3: Admin
  await runRoleSession("admin", [
    {
      filename: "04-dashboard.png",
      route: "/dashboard",
      role: "Admin",
      description: "Main administrative dashboard showing role privileges and full navigation access",
    },
    {
      filename: "05-jds-list.png",
      route: "/jds",
      role: "Admin",
      description: "Job Descriptions management showing active season JDs and reusable historical templates",
    },
    {
      filename: "06-jd-new.png",
      route: "/jds/new",
      role: "Admin",
      description: "Job Description creation form with compensation, eligibility rules, and approval settings",
    },
    {
      filename: "07-jd-detail.png",
      route: `/jds/${jdId}`,
      role: "Admin",
      description: "Detailed JD overview displaying live eligible candidate counts, status transitions, and attachments",
    },
    {
      filename: "08-jd-eligibility.png",
      route: `/jds/${jdId}/eligibility`,
      role: "Admin",
      description: "Student eligibility override console showing auto-qualified cohort and manual include/exclude actions",
    },
    {
      filename: "14-companies-kanban.png",
      route: "/companies",
      role: "Admin",
      description: "Pre-season corporate outreach CRM Kanban board with 5-stage pipeline and JPC response funnel",
    },
    {
      filename: "14b-kanban-drag.png",
      route: "/companies",
      role: "Admin",
      description: "Kanban card hover state; the current board has no drag or inline stage-change control",
      captureStatus: "Warning: requested drag/stage-change affordance is not implemented on /companies",
      options: {
        action: async (p) => {
          const firstCard = await p.$('a[href^="/companies/"]');
          if (firstCard) await firstCard.hover();
        },
      },
    },
    {
      filename: "15-company-detail.png",
      route: `/companies/${companyId}`,
      role: "Admin",
      description: "Company detail hub with supervisory tracking, contact directory, persona outreach composer, and activity log",
    },
    {
      filename: "16-defaults-admin.png",
      route: "/admin/defaults",
      role: "Admin",
      description: "Institute compliance and attendance defaults tracker with threshold configuration and CSV importer",
    },
    {
      filename: "18-reports-dashboard.png",
      route: "/reports",
      role: "Admin",
      description: "Placement analytics dashboard featuring live CTC statistics, placement rates, and season comparison metrics",
      options: {
        action: async (p) => {
          const exportDetails = await p.$("details");
          if (exportDetails) await exportDetails.evaluate((el) => { el.open = false; });
        },
      },
    },
    {
      filename: "19-reports-export.png",
      route: "/reports",
      role: "Admin",
      description: "Expanded audited export panel; submitting it calls the non-rendered /reports/export CSV endpoint",
      options: {
        action: async (p) => {
          const exportDetails = await p.$("details");
          if (exportDetails) {
            await exportDetails.evaluate((el) => {
              el.open = true;
              el.scrollIntoView({ behavior: "instant", block: "start" });
            });
          }
        },
      },
    },
    {
      filename: "23-admin-users.png",
      route: "/admin/users",
      role: "Admin",
      description: "User management console for approving pending recruiters, toggling accounts, and managing role assignments",
    },
    {
      filename: "24-admin-roles.png",
      route: "/admin/roles",
      role: "Admin",
      description: "Role-based access control matrix with custom role creation, cloning, and granular permission set bundles",
    },
    {
      filename: "25-admin-roster.png",
      route: "/admin/roster",
      role: "Admin",
      description: "Batch season setup and student roster profile sheet verification and import tool",
    },
    {
      filename: "26-admin-audit-log.png",
      route: "/admin/audit-log",
      role: "Admin",
      description: "Immutable security audit log tracing sensitive events, approvals, overrides, and permission modifications",
    },
  ]);

  // Group 4: Student
  await runRoleSession("student", [
    {
      filename: "09-jobs-student.png",
      route: "/jobs",
      role: "Student",
      description: "Student job portal displaying published JDs with automated batch eligibility checks and 1-click apply",
    },
    {
      filename: "10-applications-student.png",
      route: "/applications",
      role: "Student",
      description: "Real-time candidate application tracker showing live statuses across companies and withdrawal controls",
    },
    {
      filename: "17-defaults-student.png",
      route: "/defaults",
      role: "Student",
      description: "Student self-service compliance view tracking attended activities and penalty defaults",
    },
    {
      filename: "20-resume-list.png",
      route: "/resume",
      role: "Student",
      description: "Interactive Placement CV Maker with profile prefilling, persona-tailored versions, and JD fit analysis",
    },
    {
      filename: "21-resume-editor.png",
      route: `/resume/${cvId}`,
      role: "Student",
      description: "Rendered clean CV export preview with standardized placement formatting, PDF print, and Word DOCX export",
    },
  ]);

  // Group 5: SPC
  await runRoleSession("spc", [
    {
      filename: "11-spc-dashboard.png",
      route: "/spc",
      role: "SPC",
      description: "SPC coordination dashboard tracking active hiring pipelines, staleness alerts, and interview round progress",
    },
    {
      filename: "22-resume-review.png",
      route: "/resume/review",
      role: "SPC",
      description: "Placement Committee CV review workbench for inline bullet comments and feedback verification",
    },
  ]);

  // Group 6: Recruiter + Interaction States
  await runRoleSession("recruiter", [
    {
      filename: "12-applicants-recruiter.png",
      route: `/jds/${jdId}/applicants`,
      role: "Recruiter",
      description: "Recruiter candidate directory with multi-field filtering, CGPA sorting, and candidate evaluation tools",
    },
    {
      filename: "13-applicant-packets.png",
      route: `/jds/${jdId}/applicants/packets`,
      role: "Recruiter",
      description: "Merged candidate packets compilation for seamless offline committee and interviewer review",
    },
    // Interaction States
    {
      filename: "12a-masked.png",
      route: `/jds/${jdId}/applicants`,
      role: "Recruiter",
      description: "Recruiter matrix evidence: current RLS/view interaction omits pre-shortlist rows instead of rendering masked contacts",
      captureStatus: "Warning: no masked pre-shortlist row is rendered for a standard Recruiter account",
      options: {
        action: async (p) => {
          const masked = p.locator("td").filter({ hasText: /•{4,}/ }).first();
          if (await masked.count()) await masked.scrollIntoViewIfNeeded();
        },
      },
    },
    {
      filename: "12b-unmasked.png",
      route: `/jds/${jdId}/applicants`,
      role: "Recruiter",
      description: "Candidate directory showing unmasked phone and email contacts revealed upon candidate shortlisting",
      options: {
        action: async (p) => {
          const unmasked = p.locator("td").filter({ hasText: /\+91|@/ }).first();
          if (await unmasked.count()) await unmasked.scrollIntoViewIfNeeded();
        },
      },
    },
    {
      filename: "12c-bulk-shortlist.png",
      route: `/jds/${jdId}/applicants`,
      role: "Recruiter",
      description: "Bulk shortlist action UI in mid-selection state with multiple candidates checked and action bar populated",
      options: {
        action: async (p) => {
          const checkboxes = await p.$$('input[type="checkbox"][name="application_ids"]');
          for (let i = 0; i < Math.min(3, checkboxes.length); i++) {
            await checkboxes[i].check();
          }
          const roundInput = await p.$('input[name="round_label"]');
          if (roundInput) {
            await roundInput.fill("Round 1 - Technical");
          }
          await p.waitForSelector("text=3 selected", { timeout: 10000 });
        },
      },
    },
  ]);

  await browser.close();

  // Write manifest.md
  console.log("\nWriting docs/screenshots/manifest.md...");
  let manifestContent = `# PlacementOS Screen & Interaction Manifest\n\n`;
  manifestContent += `Generated automated screenshots for PlacementOS technical documentation.\n\n`;
  manifestContent += `| Filename | Route | Persona / Role | Description | Status |\n`;
  manifestContent += `| :--- | :--- | :--- | :--- | :--- |\n`;

  const orderedManifest = [...manifest].sort(
    (left, right) => MANIFEST_ORDER.indexOf(left.filename) - MANIFEST_ORDER.indexOf(right.filename),
  );
  for (const item of orderedManifest) {
    const status = item.status === "Success"
      ? "✅ Success"
      : item.status.startsWith("Warning:")
        ? `⚠️ ${item.status.slice("Warning: ".length)}`
        : `❌ ${item.status}`;
    manifestContent += `| \`${item.filename}\` | \`${item.route}\` | **${item.role}** | ${item.description} | ${status} |\n`;
  }

  manifestContent += `\n*Captured with Playwright Chromium at 1440x900 viewport in dark theme mode.*\n`;

  const manifestPath = path.join(OUTPUT_DIR, "manifest.md");
  await fs.writeFile(manifestPath, manifestContent, "utf-8");
  console.log(`Manifest saved to ${manifestPath}`);
  console.log(`Total captured: ${manifest.length} screenshots`);
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
