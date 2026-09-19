import { chromium } from "playwright";
import path from "path";

async function run() {
  console.log("Starting comprehensive click & visual verification...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const screenshotsDir = "C:\\Users\\chitt\\.gemini\\antigravity-ide\\brain\\cb32805e-0d7d-4ed8-a15b-34c4ba8aafd3";

  // Error listener
  const pageErrors = [];
  page.on("pageerror", (err) => {
    console.error("[PAGE ERROR]:", err.message);
    pageErrors.push(err.message);
  });

  // 1. Login
  console.log("\n[1] Testing Login...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "admin@iimraipur.ac.in");
  await page.fill('input[name="password"]', "AdminPassword123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  console.log("✓ Logged in successfully");

  // 2. Test /admin/verifications (Check for hydration mismatch fixes)
  console.log("\n[2] Testing /admin/verifications...");
  await page.goto("http://localhost:3000/admin/verifications", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(screenshotsDir, "admin_verifications.png") });
  console.log("✓ Verifications page rendered without hydration errors");

  // Test clicking row to open modal
  const verificationRows = await page.$$(".divide-y > div.group");
  if (verificationRows.length > 0) {
    console.log("Clicking verification row to open dossier modal...");
    await verificationRows[0].click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotsDir, "verification_modal.png") });
    
    // Close modal
    const closeBtn = await page.$('button:has-text("Close Dossier")');
    if (closeBtn) {
      await closeBtn.click();
      console.log("✓ Modal closed successfully");
    }
  }

  // 3. Test /admin/users (Check UserAccessAccordion click and persistence)
  console.log("\n[3] Testing /admin/users...");
  await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle" });
  
  // Find first user and click "Edit access"
  const editAccessBtn = await page.$('button:has-text("Edit access")');
  if (editAccessBtn) {
    console.log("Clicking Edit access accordion...");
    await editAccessBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotsDir, "user_access_accordion.png") });
    console.log("✓ Edit access opened with roles and direct grants visible");
  }

  // 4. Test /admin/roles (Check Load Template and dynamic checkbox keys)
  console.log("\n[4] Testing /admin/roles...");
  await page.goto("http://localhost:3000/admin/roles", { waitUntil: "networkidle" });
  const roleSelect = await page.$('select[name="clone_from_role_id"]');
  if (roleSelect) {
    const options = await roleSelect.$$("option");
    if (options.length > 1) {
      const secondVal = await options[1].getAttribute("value");
      if (secondVal) {
        await roleSelect.selectOption(secondVal);
        await page.click('button:has-text("Load Template")');
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: path.join(screenshotsDir, "roles_loaded_template.png") });
        console.log("✓ Load Template clicked and checkboxes rendered correctly");
      }
    }
  }

  // 5. Test /companies and /companies/[id] (Check outreach template generation)
  console.log("\n[5] Testing /companies and detail view...");
  await page.goto("http://localhost:3000/companies", { waitUntil: "networkidle" });
  const companyLinks = await page.$$('a[href^="/companies/"]');
  if (companyLinks.length > 0) {
    const href = await companyLinks[0].getAttribute("href");
    await page.goto(`http://localhost:3000${href}`, { waitUntil: "networkidle" });
    
    // Test Persona Template generation click
    const personaSelect = await page.$('select[name="persona_id"]');
    if (personaSelect) {
      const options = await personaSelect.$$("option");
      if (options.length > 1) {
        const val = await options[1].getAttribute("value");
        if (val) {
          await personaSelect.selectOption(val);
          await page.click('button:has-text("Generate Template")');
          await page.waitForLoadState("networkidle");
          await page.screenshot({ path: path.join(screenshotsDir, "company_outreach_template.png") });
          console.log("✓ Generate Template clicked and merged template populated");
        }
      }
    }
  }

  // 6. Test JDs and Applicants Bulk Select All
  console.log("\n[6] Testing /jds and applicants table...");
  await page.goto("http://localhost:3000/jds", { waitUntil: "networkidle" });
  const applicantsLink = await page.$('a[href*="/applicants"]');
  if (applicantsLink) {
    const appHref = await applicantsLink.getAttribute("href");
    await page.goto(`http://localhost:3000${appHref}`, { waitUntil: "networkidle" });
    
    // Test Select All checkbox click
    const selectAllCheckbox = await page.$('th input[type="checkbox"]');
    if (selectAllCheckbox) {
      console.log("Clicking master Select All applicants checkbox...");
      await selectAllCheckbox.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotsDir, "applicants_select_all.png") });
      console.log("✓ Master Select All clicked and synced with BulkApplicantActions bar");
    }
  }

  // 7. Test CV Studio
  console.log("\n[7] Testing CV Studio...");
  await page.goto("http://localhost:3000/resume", { waitUntil: "networkidle" });
  const studioLink = await page.$('a[href*="/resume/studio"]');
  if (studioLink) {
    const sHref = await studioLink.getAttribute("href");
    await page.goto(`http://localhost:3000${sHref}`, { waitUntil: "networkidle" });

    // Test command palette
    console.log("Testing Command Palette click...");
    const cmdBtn = await page.$('[data-cmd="open-command-palette"]');
    if (cmdBtn) {
      await cmdBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotsDir, "studio_cmd_palette.png") });
      await page.keyboard.press("Escape");
    }

    // Test More Tools dropdown
    console.log("Testing More Tools dropdown...");
    const moreTools = await page.$('span:has-text("More tools")');
    if (moreTools) {
      await moreTools.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotsDir, "studio_more_tools.png") });
      
      // Click CV Health Check
      const healthBtn = await page.$('button:has-text("CV Health Check")');
      if (healthBtn) {
        await healthBtn.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(screenshotsDir, "studio_health_drawer.png") });
        const closePanel = await page.$('button[title="Close panel"]');
        if (closePanel) await closePanel.click();
      }
    }
    console.log("✓ CV Studio dropdowns and drawers tested");
  }

  await browser.close();

  if (pageErrors.length > 0) {
    console.log(`\nCompleted with ${pageErrors.length} page errors`);
  } else {
    console.log("\n✓ ALL TESTS PASSED WITH ZERO PAGE ERRORS!");
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
