import { chromium } from "playwright";

async function main() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console messages and errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[BROWSER ERROR] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.error(`[PAGE ERROR] ${err.message}`);
  });

  console.log("Navigating to login...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });

  console.log("Filling credentials...");
  await page.fill('input[name="email"]', "admin@iimraipur.ac.in");
  await page.fill('input[name="password"]', "AdminPassword123!");
  await page.click('button[type="submit"]');

  await page.waitForURL("**/dashboard", { timeout: 15000 });
  console.log("Logged in successfully. Current URL:", page.url());

  const navLinks = [
    "/dashboard",
    "/spc",
    "/reports",
    "/companies",
    "/jds",
    "/jds/new",
    "/resume/review",
    "/admin/roster",
    "/admin/defaults",
    "/admin/verifications",
    "/admin/users",
    "/admin/roles",
    "/admin/audit-log",
    "/admin/deliverability"
  ];

  for (const link of navLinks) {
    console.log(`\nTesting page: ${link}`);
    await page.goto(`http://localhost:3000${link}`, { waitUntil: "networkidle" });
    console.log(`Page title: ${await page.title()}`);

    // Check all clickable buttons and links on the page
    const buttons = await page.$$("button, a, select, summary");
    console.log(`Found ${buttons.length} interactive elements on ${link}`);
  }

  // Now let's test specific pages with complex click interactions
  // 1. Test /admin/users
  console.log("\n--- Testing /admin/users interactions ---");
  await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle" });

  // Test clicking "Edit access" details
  const details = await page.$$("details");
  console.log(`Found ${details.length} details elements on /admin/users`);
  for (let i = 0; i < Math.min(details.length, 3); i++) {
    const summary = await details[i].$("summary");
    if (summary) {
      await summary.click();
      console.log(`Clicked details summary ${i}`);
    }
  }

  // 2. Test /companies
  console.log("\n--- Testing /companies interactions ---");
  await page.goto("http://localhost:3000/companies", { waitUntil: "networkidle" });
  const companyLinks = await page.$$('a[href^="/companies/"]');
  console.log(`Found ${companyLinks.length} company links`);
  if (companyLinks.length > 0) {
    const firstHref = await companyLinks[0].getAttribute("href");
    console.log(`Navigating to company detail: ${firstHref}`);
    await page.goto(`http://localhost:3000${firstHref}`, { waitUntil: "networkidle" });
    
    // Check buttons on company detail page
    const companyButtons = await page.$$("button");
    console.log(`Found ${companyButtons.length} buttons on company detail page`);
  }

  // 3. Test /reports
  console.log("\n--- Testing /reports interactions ---");
  await page.goto("http://localhost:3000/reports", { waitUntil: "networkidle" });

  // 4. Test /resume/studio or /resume
  console.log("\n--- Testing /resume studio interactions ---");
  await page.goto("http://localhost:3000/resume", { waitUntil: "networkidle" });
  console.log("Resume page loaded. URL:", page.url());

  const studioLink = await page.$('a[href^="/resume/studio"]');
  if (studioLink) {
    const href = await studioLink.getAttribute("href");
    console.log("Visiting studio:", href);
    await page.goto(`http://localhost:3000${href}`, { waitUntil: "networkidle" });

    // Test studio topbar dropdowns and buttons
    console.log("Testing Studio buttons...");
    const cmdPaletteBtn = await page.$('[data-cmd="open-command-palette"]');
    if (cmdPaletteBtn) {
      await cmdPaletteBtn.click();
      console.log("Command palette opened");
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape");
      console.log("Command palette closed with Escape");
    }

    const aiBtn = await page.$('[data-cmd="open-ai-assistant"]');
    if (aiBtn) {
      await aiBtn.click();
      console.log("AI Assistant drawer opened");
      await page.waitForTimeout(500);
      const closeBtn = await page.$('button[title="Close panel"]');
      if (closeBtn) await closeBtn.click();
      console.log("AI Assistant drawer closed");
    }
  }

  await browser.close();
  console.log("\nAll visual click tests completed successfully!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
