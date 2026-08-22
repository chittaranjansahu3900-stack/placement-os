import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const instituteSlug = process.env.NEXT_PUBLIC_INSTITUTE_SLUG || "iim-raipur";
const screenshotPassword = process.env.SCREENSHOT_TEST_PASSWORD;

if (!url || !serviceKey || !screenshotPassword) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SCREENSHOT_TEST_PASSWORD",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("Starting seed script...");

  // 1. Institute
  let { data: institute } = await supabase
    .from("institutes")
    .select("*")
    .eq("slug", instituteSlug)
    .maybeSingle();

  if (!institute) {
    const { data: newInst, error } = await supabase
      .from("institutes")
      .insert({ name: "IIM Raipur", slug: instituteSlug })
      .select()
      .single();
    if (error) throw error;
    institute = newInst;
  }
  console.log("Institute:", institute.name, institute.id);

  // 2. Batches
  let { data: activeBatch } = await supabase
    .from("batches")
    .select("*")
    .eq("institute_id", institute.id)
    .eq("name", "PGP 2024-26")
    .maybeSingle();

  if (!activeBatch) {
    const { data: b, error } = await supabase
      .from("batches")
      .insert({
        institute_id: institute.id,
        name: "PGP 2024-26",
        is_active: true,
        starts_on: "2024-06-15",
        ends_on: "2026-04-30",
      })
      .select()
      .single();
    if (error) throw error;
    activeBatch = b;
  }

  let { data: pastBatch } = await supabase
    .from("batches")
    .select("*")
    .eq("institute_id", institute.id)
    .eq("name", "PGP 2023-25")
    .maybeSingle();

  if (!pastBatch) {
    const { data: b, error } = await supabase
      .from("batches")
      .insert({
        institute_id: institute.id,
        name: "PGP 2023-25",
        is_active: false,
        starts_on: "2023-06-15",
        ends_on: "2025-04-30",
      })
      .select()
      .single();
    if (error) throw error;
    pastBatch = b;
  }
  console.log("Batches:", activeBatch.name, pastBatch.name);

  // 3. Institute settings
  await supabase
    .from("institute_settings")
    .upsert({
      institute_id: institute.id,
      defaults_threshold: 4,
      staleness_days: 3,
    });

  // 4. Personas
  const personasData = [
    { category_name: "Technology & Product", template_content: "Dear {{contact_title}} {{contact_last_name}},\n\nI am writing on behalf of the Placement Committee at IIM Raipur regarding placement partnerships with {{company_name}} for our flagship PGP cohort.\n\nWarm regards,\n{{sender_name}}\nPlacement Committee, IIM Raipur" },
    { category_name: "Management Consulting", template_content: "Dear {{contact_title}} {{contact_last_name}},\n\nGreetings from IIM Raipur. We would be delighted to invite {{company_name}} for our upcoming placement drive.\n\nBest regards,\n{{sender_name}}\nPlacement Committee" },
    { category_name: "Investment Banking & BFSI", template_content: "Dear {{contact_title}} {{contact_last_name}},\n\nWe present the executive profile of IIM Raipur's graduating batch for front-office and analyst roles at {{company_name}}.\n\nSincerely,\n{{sender_name}}" },
    { category_name: "FMCG & Sales", template_content: "Dear {{contact_title}} {{contact_last_name}},\n\nGreetings! We are pleased to connect regarding executive sales and marketing opportunities at {{company_name}}.\n\nWarm regards,\n{{sender_name}}" },
  ];
  for (const p of personasData) {
    await supabase.from("company_type_personas").upsert(p, { onConflict: "category_name" });
  }
  const { data: allPersonas } = await supabase.from("company_type_personas").select("*");
  const techPersona = allPersonas.find((p) => p.category_name.includes("Technology"));

  // 5. Companies
  const companiesSeed = [
    { name: "Google India", sector: "Technology", pipeline_stage: "onboarded", jd_form_received: true },
    { name: "McKinsey & Company", sector: "Management Consulting", pipeline_stage: "committed", jd_form_received: true },
    { name: "Goldman Sachs", sector: "Investment Banking", pipeline_stage: "interested", jd_form_received: false },
    { name: "Hindustan Unilever", sector: "FMCG", pipeline_stage: "contacted", jd_form_received: false },
    { name: "NovaTech AI", sector: "Artificial Intelligence", pipeline_stage: "prospect", jd_form_received: false },
  ];

  const companyMap = new Map();
  for (const c of companiesSeed) {
    let { data: comp } = await supabase
      .from("companies")
      .select("*")
      .eq("institute_id", institute.id)
      .eq("name", c.name)
      .maybeSingle();

    if (!comp) {
      const { data: newComp, error } = await supabase
        .from("companies")
        .insert({ institute_id: institute.id, ...c })
        .select()
        .single();
      if (error) throw error;
      comp = newComp;
    }
    companyMap.set(c.name, comp);
  }

  // Company Contacts
  const contactsSeed = [
    { company_id: companyMap.get("Google India").id, title: "Ms.", full_name: "Meera Krishnan", last_name: "Krishnan", hr_designation: "Head of University Recruiting", email: "meera.k@google.com", phone: "+91 98765 43210" },
    { company_id: companyMap.get("McKinsey & Company").id, title: "Mr.", full_name: "David Vance", last_name: "Vance", hr_designation: "Partner & Head of Campus Hiring", email: "david_vance@mckinsey.com", phone: "+91 98111 22334" },
    { company_id: companyMap.get("Goldman Sachs").id, title: "Ms.", full_name: "Ananya Deshmukh", last_name: "Deshmukh", hr_designation: "VP - Talent Acquisition", email: "ananya.deshmukh@gs.com", phone: "+91 98222 33445" },
    { company_id: companyMap.get("Hindustan Unilever").id, title: "Mr.", full_name: "Rahul Mehta", last_name: "Mehta", hr_designation: "Lead Talent Strategist", email: "rahul.mehta@hul.com", phone: "+91 98333 44556" },
  ];
  for (const contact of contactsSeed) {
    const { data: existing } = await supabase
      .from("company_contacts")
      .select("id")
      .eq("company_id", contact.company_id)
      .eq("email", contact.email)
      .maybeSingle();
    if (!existing) {
      await supabase.from("company_contacts").insert(contact);
    }
  }

  // 6. Roles & Base reference
  const { data: roles } = await supabase.from("roles").select("*");
  const roleByName = new Map(roles.map((r) => [r.name, r]));

  // Create custom role if not exists
  let customRole = roles.find((r) => r.name === "Senior SPC");
  if (!customRole && roleByName.get("SPC")) {
    const { data: r } = await supabase
      .from("roles")
      .insert({
        institute_id: institute.id,
        name: "Senior SPC",
        is_base_role: false,
        cloned_from_role_id: roleByName.get("SPC").id,
      })
      .select()
      .single();
    customRole = r;
    // Copy permissions from SPC
    const { data: spcPerms } = await supabase
      .from("role_permission_sets")
      .select("permission_set_id")
      .eq("role_id", roleByName.get("SPC").id);
    if (spcPerms && spcPerms.length > 0) {
      await supabase.from("role_permission_sets").insert(
        spcPerms.map((p) => ({ role_id: customRole.id, permission_set_id: p.permission_set_id }))
      );
    }
  }

  // 7. Users helper
  async function ensureUser({ email, password, name, status, roleName, companyId, batchId }) {
    // Auth user
    const { data: list } = await supabase.auth.admin.listUsers();
    let authUser = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!authUser) {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email,
        password: password || screenshotPassword,
        email_confirm: true,
      });
      if (error) throw error;
      authUser = created.user;
    } else if (password) {
      await supabase.auth.admin.updateUserById(authUser.id, { password, email_confirm: true });
    }

    // Public user
    let { data: userRow } = await supabase
      .from("users")
      .select("*")
      .eq("institute_id", institute.id)
      .eq("email", email)
      .maybeSingle();

    if (!userRow) {
      const { data: u, error } = await supabase
        .from("users")
        .insert({
          institute_id: institute.id,
          auth_user_id: authUser.id,
          name,
          email,
          status: status || "active",
          company_id: companyId || null,
          batch_id: batchId || null,
        })
        .select()
        .single();
      if (error) throw error;
      userRow = u;
    } else {
      await supabase
        .from("users")
        .update({
          auth_user_id: authUser.id,
          name,
          status: status || userRow.status,
          company_id: companyId !== undefined ? companyId : userRow.company_id,
          batch_id: batchId !== undefined ? batchId : userRow.batch_id,
        })
        .eq("id", userRow.id);
    }

    // Role assignment
    const targetRole = roleByName.get(roleName);
    if (targetRole) {
      await supabase
        .from("user_roles")
        .upsert({ user_id: userRow.id, role_id: targetRole.id });
    }
    return userRow;
  }

  // Create primary test accounts
  const adminUser = await ensureUser({
    email: "admin@iimraipur.ac.in",
    password: screenshotPassword,
    name: "Prof. Rajesh Kumar (CDPO)",
    status: "active",
    roleName: "Admin",
  });

  const spcUser = await ensureUser({
    email: "spc@iimraipur.ac.in",
    password: screenshotPassword,
    name: "Sneha Patel (Head SPC)",
    status: "active",
    roleName: "SPC",
    batchId: activeBatch.id,
  });

  const bdUser = await ensureUser({
    email: "bd@iimraipur.ac.in",
    password: screenshotPassword,
    name: "Rohan Gupta (JPC Lead)",
    status: "active",
    roleName: "BD",
    batchId: activeBatch.id,
  });

  const recruiterUser = await ensureUser({
    email: "recruiter@google.com",
    password: screenshotPassword,
    name: "Meera Krishnan (Google TA)",
    status: "active",
    roleName: "Recruiter",
    companyId: companyMap.get("Google India").id,
  });

  await ensureUser({
    email: "pending@startup.com",
    password: screenshotPassword,
    name: "Aditya Roy (NovaTech AI)",
    status: "pending",
    roleName: "Recruiter",
    companyId: companyMap.get("NovaTech AI").id,
  });

  const studentUser = await ensureUser({
    email: "student@iimraipur.ac.in",
    password: screenshotPassword,
    name: "Aarav Sharma",
    status: "active",
    roleName: "Student",
    batchId: activeBatch.id,
  });

  console.log("Users ensured: Admin, SPC, BD, Recruiter, Pending Recruiter, Student");

  // Update company owners / supervisors
  await supabase
    .from("companies")
    .update({ owner_user_id: bdUser.id, supervisor_user_id: spcUser.id })
    .eq("id", companyMap.get("Google India").id);

  await supabase
    .from("companies")
    .update({ owner_user_id: bdUser.id, supervisor_user_id: spcUser.id })
    .eq("id", companyMap.get("McKinsey & Company").id);

  await supabase
    .from("companies")
    .update({ owner_user_id: bdUser.id })
    .eq("id", companyMap.get("Goldman Sachs").id);

  // 8. Students Cohort
  const cohortData = [
    {
      roll_no: "24PGP001",
      name: "Aarav Sharma",
      user_id: studentUser.id,
      batch_id: activeBatch.id,
      age: 24,
      gender: "Male",
      phone: "+91 98765 11001",
      personal_email: "aarav.sharma@example.com",
      total_work_ex_months: 28,
      section: "A",
      graduation_details: { college: "IIT Bombay", branch: "Computer Science", cgpa: 8.85, year: 2022 },
      pg_details: { specialization: "Product Management & Strategy", cgpa: 8.92, year: 2026 },
      prior_employers: [{ company: "Microsoft", role: "Software Engineer", duration_months: 28 }],
      placement_status: "unplaced",
    },
    {
      roll_no: "24PGP002",
      name: "Ananya Iyer",
      batch_id: activeBatch.id,
      age: 23,
      gender: "Female",
      phone: "+91 98765 11002",
      personal_email: "ananya.iyer@example.com",
      total_work_ex_months: 18,
      section: "A",
      graduation_details: { college: "BITS Pilani", branch: "Economics & Finance", cgpa: 9.1, year: 2023 },
      pg_details: { specialization: "Finance & Strategy", cgpa: 9.25, year: 2026 },
      prior_employers: [{ company: "EY Parthenon", role: "Associate", duration_months: 18 }],
      placement_status: "unplaced",
    },
    {
      roll_no: "24PGP003",
      name: "Rohan Verma",
      batch_id: activeBatch.id,
      age: 25,
      gender: "Male",
      phone: "+91 98765 11003",
      personal_email: "rohan.verma@example.com",
      total_work_ex_months: 36,
      section: "B",
      graduation_details: { college: "NIT Trichy", branch: "Mechanical Engineering", cgpa: 8.4, year: 2021 },
      pg_details: { specialization: "Operations & Supply Chain", cgpa: 8.55, year: 2026 },
      prior_employers: [{ company: "ITC Limited", role: "Assistant Manager", duration_months: 36 }],
      placement_status: "unplaced",
    },
    {
      roll_no: "24PGP004",
      name: "Priya Nair",
      batch_id: activeBatch.id,
      age: 24,
      gender: "Female",
      phone: "+91 98765 11004",
      personal_email: "priya.nair@example.com",
      total_work_ex_months: 24,
      section: "B",
      graduation_details: { college: "SRCC Delhi", branch: "Commerce", cgpa: 9.3, year: 2022 },
      pg_details: { specialization: "Marketing & Strategy", cgpa: 9.4, year: 2026 },
      prior_employers: [{ company: "Unilever", role: "Brand Specialist", duration_months: 24 }],
      placement_status: "placed",
    },
    {
      roll_no: "24PGP005",
      name: "Vikramaditya Rao",
      batch_id: activeBatch.id,
      age: 26,
      gender: "Male",
      phone: "+91 98765 11005",
      personal_email: "vikram.rao@example.com",
      total_work_ex_months: 40,
      section: "A",
      graduation_details: { college: "Delhi Technological University", branch: "Electrical Engineering", cgpa: 7.6, year: 2020 },
      pg_details: { specialization: "General Management", cgpa: 7.8, year: 2026 },
      prior_employers: [{ company: "Tata Motors", role: "Senior Engineer", duration_months: 40 }],
      placement_status: "unplaced",
    },
    {
      roll_no: "24PGP006",
      name: "Neha Gupta",
      batch_id: activeBatch.id,
      age: 23,
      gender: "Female",
      phone: "+91 98765 11006",
      personal_email: "neha.gupta@example.com",
      total_work_ex_months: 12,
      section: "B",
      graduation_details: { college: "St. Xavier's Mumbai", branch: "Economics", cgpa: 8.7, year: 2023 },
      pg_details: { specialization: "Consulting & Analytics", cgpa: 8.8, year: 2026 },
      prior_employers: [{ company: "KPMG", role: "Analyst", duration_months: 12 }],
      placement_status: "unplaced",
    },
    {
      roll_no: "24PGP007",
      name: "Siddharth Menon",
      batch_id: activeBatch.id,
      age: 24,
      gender: "Male",
      phone: "+91 98765 11007",
      personal_email: "siddharth.m@example.com",
      total_work_ex_months: 20,
      section: "A",
      graduation_details: { college: "VIT Vellore", branch: "Information Technology", cgpa: 8.1, year: 2022 },
      pg_details: { specialization: "Fintech & Product", cgpa: 8.3, year: 2026 },
      prior_employers: [{ company: "Paytm", role: "Associate Product Analyst", duration_months: 20 }],
      placement_status: "unplaced",
    },
    {
      roll_no: "24PGP008",
      name: "Tanvi Kulkarni",
      batch_id: activeBatch.id,
      age: 23,
      gender: "Female",
      phone: "+91 98765 11008",
      personal_email: "tanvi.k@example.com",
      total_work_ex_months: 0,
      section: "B",
      graduation_details: { college: "Lady Shri Ram College", branch: "Statistics", cgpa: 9.0, year: 2024 },
      pg_details: { specialization: "Data Analytics & Marketing", cgpa: 9.15, year: 2026 },
      prior_employers: [],
      placement_status: "unplaced",
    },
    // Historical Batch Students (for comparison report)
    {
      roll_no: "23PGP011",
      name: "Kabir Mehta",
      batch_id: pastBatch.id,
      age: 25,
      gender: "Male",
      phone: "+91 98765 10011",
      personal_email: "kabir.mehta@example.com",
      total_work_ex_months: 24,
      section: "A",
      graduation_details: { college: "IIT Madras", branch: "Computer Science", cgpa: 8.9, year: 2021 },
      pg_details: { specialization: "Product Management", cgpa: 9.0, year: 2025 },
      placement_status: "placed",
    },
    {
      roll_no: "23PGP012",
      name: "Rhea Sen",
      batch_id: pastBatch.id,
      age: 24,
      gender: "Female",
      phone: "+91 98765 10012",
      personal_email: "rhea.sen@example.com",
      total_work_ex_months: 18,
      section: "A",
      graduation_details: { college: "SRCC", branch: "Economics", cgpa: 9.2, year: 2022 },
      pg_details: { specialization: "Consulting", cgpa: 9.3, year: 2025 },
      placement_status: "placed",
    },
    {
      roll_no: "23PGP013",
      name: "Arjun Singhal",
      batch_id: pastBatch.id,
      age: 26,
      gender: "Male",
      phone: "+91 98765 10013",
      personal_email: "arjun.s@example.com",
      total_work_ex_months: 30,
      section: "B",
      graduation_details: { college: "BITS Goa", branch: "Electrical", cgpa: 8.5, year: 2021 },
      pg_details: { specialization: "Finance", cgpa: 8.7, year: 2025 },
      placement_status: "placed",
    },
    {
      roll_no: "23PGP014",
      name: "Divya Kapoor",
      batch_id: pastBatch.id,
      age: 24,
      gender: "Female",
      phone: "+91 98765 10014",
      personal_email: "divya.k@example.com",
      total_work_ex_months: 12,
      section: "B",
      graduation_details: { college: "Hansraj College", branch: "Commerce", cgpa: 8.6, year: 2022 },
      pg_details: { specialization: "Marketing", cgpa: 8.8, year: 2025 },
      placement_status: "unplaced",
    },
  ];

  const studentMap = new Map();
  for (const s of cohortData) {
    let { data: studentRow } = await supabase
      .from("students")
      .select("*")
      .eq("batch_id", s.batch_id)
      .eq("roll_no", s.roll_no)
      .maybeSingle();

    if (!studentRow) {
      const { data: created, error } = await supabase
        .from("students")
        .insert(s)
        .select()
        .single();
      if (error) throw error;
      studentRow = created;
    } else {
      await supabase.from("students").update(s).eq("id", studentRow.id);
    }
    studentMap.set(s.roll_no, studentRow);
  }
  console.log("Students seeded:", studentMap.size);

  const aaravStudent = studentMap.get("24PGP001");

  // 9. CV Documents for Aarav Sharma & Others
  const cvContentAarav = {
    title: "Product & Strategy CV",
    personalInfo: {
      name: "Aarav Sharma",
      email: "aarav.sharma@iimraipur.ac.in",
      phone: "+91 98765 11001",
      linkedin: "linkedin.com/in/aaravsharma-iim",
      location: "Raipur / Mumbai, India",
      summary: "MBA candidate at IIM Raipur with 28 months of software engineering experience at Microsoft. Proven track record in shipping customer-facing features, data-driven prioritization, and cross-functional leadership.",
    },
    academics: [
      { id: "acad-1", institute: "Indian Institute of Management Raipur", course: "MBA (PGP)", year: "2024 - 2026", result: "8.92 / 10 CGPA (Top 5%)" },
      { id: "acad-2", institute: "Indian Institute of Technology Bombay", course: "B.Tech in Computer Science", year: "2018 - 2022", result: "8.85 / 10 CGPA" },
      { id: "acad-3", institute: "Delhi Public School, R.K. Puram", course: "CBSE Class XII (Science)", year: "2018", result: "96.4%" },
    ],
    experience: [
      {
        id: "exp-1",
        company: "Microsoft India R&D",
        role: "Software Development Engineer",
        period: "Jul 2022 – Oct 2024",
        bullets: [
          { id: "b1", text: "Architected and delivered low-latency distributed telemetry pipeline handling 140M+ events/day, cutting latency by 34%." },
          { id: "b2", text: "Led cross-functional team of 6 engineers and designers to launch Azure Observability dashboard, driving 22% increase in monthly active users." },
          { id: "b3", text: "Spearheaded quarterly A/B experiments on developer portal, improving onboarding funnel conversion rate from 54% to 71%." },
        ],
      },
    ],
    projects: [
      {
        id: "proj-1",
        name: "FinFlow — AI Micro-Investment App",
        role: "Lead Product Designer & Developer",
        period: "Jan 2024 – Apr 2024",
        link: "github.com/aarav/finflow",
        bullets: [
          { id: "pb1", text: "Designed user flow and gamified spare-change rounding engine scaled to 15,000 beta users within 60 days." },
          { id: "pb2", text: "Integrated Open Banking APIs and optimized onboarding drop-off by 40% using funnel analytics." },
        ],
      },
    ],
    positions: [
      {
        id: "pos-1",
        company: "IIM Raipur Placement Committee",
        role: "Senior Placement Coordinator (SPC)",
        period: "Jul 2024 – Present",
        bullets: [
          { id: "posb1", text: "Managing corporate outreach and relationships with 45+ premier recruiters across Technology and Consulting domains." },
        ],
      },
    ],
    skills: ["Product Strategy", "Roadmap Planning", "A/B Testing", "SQL & Python", "User Journey Mapping", "Go-To-Market Strategy", "Financial Modeling"],
    certifications: ["Pragmatic Institute Certified Product Manager", "Scrum Alliance Certified Product Owner (CSPO)"],
    awards: ["Director's Merit List — IIM Raipur (Term 1 & 2)", "Microsoft Spot Award for Customer Obsession (Q3 2023)"],
    jdFit: {
      jdId: "temp-jd",
      score: 91,
      matchedKeywords: ["Product Strategy", "A/B Testing", "Roadmap", "Telemetry", "Cross-functional Leadership", "SQL", "User Analytics"],
      missingKeywords: ["B2B SaaS Pricing", "Enterprise Sales Cycle"],
      sectionCoverage: {
        summary: 95,
        academics: 90,
        experience: 94,
        projects: 88,
        skills: 92,
      },
      analyzedAt: new Date().toISOString(),
    },
  };

  // Upsert CV Document for Aarav
  let { data: aaravCv } = await supabase
    .from("cv_documents")
    .select("*")
    .eq("student_id", aaravStudent.id)
    .maybeSingle();

  if (!aaravCv) {
    const { data: newCv, error } = await supabase
      .from("cv_documents")
      .insert({
        student_id: aaravStudent.id,
        persona_id: techPersona?.id || null,
        version_no: 1,
        template_id: "placement-cell-v2",
        ats_score: 94,
        jd_coverage_score: 91,
        content: cvContentAarav,
        is_latest: true,
      })
      .select()
      .single();
    if (error) throw error;
    aaravCv = newCv;
  } else {
    await supabase
      .from("cv_documents")
      .update({
        content: cvContentAarav,
        ats_score: 94,
        jd_coverage_score: 91,
      })
      .eq("id", aaravCv.id);
  }

  await supabase
    .from("students")
    .update({ latest_cv_document_id: aaravCv.id })
    .eq("id", aaravStudent.id);

  // Add CV Review comments
  const { data: existingComments } = await supabase
    .from("cv_review_comments")
    .select("id")
    .eq("cv_document_id", aaravCv.id);

  if (!existingComments || existingComments.length === 0) {
    await supabase.from("cv_review_comments").insert([
      {
        cv_document_id: aaravCv.id,
        spc_user_id: spcUser.id,
        anchor_section: "experience",
        anchor_bullet_id: "b2",
        comment_text: "Great metric on the Azure dashboard! Consider mentioning the revenue impact or cloud cost savings if available.",
        status: "open",
      },
      {
        cv_document_id: aaravCv.id,
        spc_user_id: spcUser.id,
        anchor_section: "skills",
        anchor_bullet_id: null,
        comment_text: "Ensure keywords match Tech & Product personas (e.g., SQL, Tableau, Feature Flagging).",
        status: "applied",
      },
    ]);
  }

  // 10. Job Descriptions (JDs)
  const deadlineIn7Days = new Date(Date.now() + 7 * 86400000).toISOString();
  const deadlineIn3Days = new Date(Date.now() + 3 * 86400000).toISOString();
  const deadlineIn10Days = new Date(Date.now() + 10 * 86400000).toISOString();
  const deadlineIn14Days = new Date(Date.now() + 14 * 86400000).toISOString();
  const pastDeadline = new Date(Date.now() - 180 * 86400000).toISOString();

  const jdsSeed = [
    {
      company_id: companyMap.get("Google India").id,
      batch_id: activeBatch.id,
      created_by_user_id: recruiterUser.id,
      role_title: "Product Manager - Core Infrastructure",
      grade: "L4 / PM-I",
      ctc_fixed: 28,
      ctc_variable: 6,
      ctc_total: 34,
      locations: ["Bangalore", "Hyderabad"],
      eligible_branches: ["Marketing", "Operations", "Finance", "General Management"],
      eligible_specializations: ["Product Management & Strategy", "Consulting & Analytics", "Fintech & Product"],
      min_cgpa: 7.5,
      max_backlog: 0,
      unplaced_only: false,
      open_positions: 4,
      apply_by_deadline: deadlineIn7Days,
      status: "published",
      admin_approval_required: false,
    },
    {
      company_id: companyMap.get("McKinsey & Company").id,
      batch_id: activeBatch.id,
      created_by_user_id: adminUser.id,
      role_title: "Associate Consultant - Digital Practice",
      grade: "Associate",
      ctc_fixed: 30,
      ctc_variable: 6,
      ctc_total: 36,
      locations: ["Mumbai", "Gurugram"],
      eligible_branches: ["General Management", "Finance", "Marketing"],
      eligible_specializations: ["Finance & Strategy", "Consulting & Analytics"],
      min_cgpa: 8.0,
      max_backlog: 0,
      unplaced_only: true,
      open_positions: 6,
      apply_by_deadline: deadlineIn3Days,
      status: "shortlisting",
      admin_approval_required: false,
    },
    {
      company_id: companyMap.get("Goldman Sachs").id,
      batch_id: activeBatch.id,
      created_by_user_id: adminUser.id,
      role_title: "Investment Banking Analyst",
      grade: "Analyst II",
      ctc_fixed: 26,
      ctc_variable: 6,
      ctc_total: 32,
      locations: ["Mumbai", "Bangalore"],
      eligible_branches: ["Finance"],
      eligible_specializations: ["Finance & Strategy", "Fintech & Product"],
      min_cgpa: 7.8,
      max_backlog: 0,
      unplaced_only: true,
      open_positions: 3,
      apply_by_deadline: deadlineIn10Days,
      status: "published",
      admin_approval_required: false,
    },
    {
      company_id: companyMap.get("Hindustan Unilever").id,
      batch_id: activeBatch.id,
      created_by_user_id: adminUser.id,
      role_title: "Management Trainee - Sales & Brand Management",
      grade: "UFLP MT",
      ctc_fixed: 22,
      ctc_variable: 5,
      ctc_total: 27,
      locations: ["Mumbai", "Delhi", "Kolkata"],
      eligible_branches: ["Marketing"],
      eligible_specializations: ["Marketing & Strategy", "Data Analytics & Marketing"],
      min_cgpa: 7.0,
      max_backlog: 0,
      unplaced_only: true,
      open_positions: 5,
      apply_by_deadline: deadlineIn14Days,
      status: "draft",
      admin_approval_required: true,
    },
    // Historical JD
    {
      company_id: companyMap.get("Google India").id,
      batch_id: pastBatch.id,
      created_by_user_id: adminUser.id,
      role_title: "Associate Product Manager (APM)",
      grade: "L3",
      ctc_fixed: 24,
      ctc_variable: 4,
      ctc_total: 28,
      locations: ["Bangalore"],
      eligible_branches: [],
      eligible_specializations: [],
      min_cgpa: 7.5,
      max_backlog: 0,
      unplaced_only: true,
      open_positions: 2,
      apply_by_deadline: pastDeadline,
      status: "closed",
      admin_approval_required: false,
    },
  ];

  const jdMap = new Map();
  for (const j of jdsSeed) {
    let { data: jdRow } = await supabase
      .from("jds")
      .select("*")
      .eq("company_id", j.company_id)
      .eq("batch_id", j.batch_id)
      .eq("role_title", j.role_title)
      .maybeSingle();

    if (!jdRow) {
      const { data: created, error } = await supabase
        .from("jds")
        .insert(j)
        .select()
        .single();
      if (error) throw error;
      jdRow = created;
    } else {
      await supabase.from("jds").update(j).eq("id", jdRow.id);
    }
    jdMap.set(j.role_title, jdRow);
  }
  console.log("JDs seeded:", jdMap.size);

  const googleJd = jdMap.get("Product Manager - Core Infrastructure");
  const mckinseyJd = jdMap.get("Associate Consultant - Digital Practice");
  const gsJd = jdMap.get("Investment Banking Analyst");

  // 11. Applications for Google PM
  const googleApps = [
    {
      student_id: studentMap.get("24PGP001").id, // Aarav Sharma
      jd_id: googleJd.id,
      cv_document_id: aaravCv.id,
      status: "shortlisted",
      round_history: [
        {
          round: "Round 1 - Technical & Product Interview",
          scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
          location: "Google Meet / Virtual Room 3",
          assigned_by_user_id: spcUser.id,
          assigned_at: new Date().toISOString(),
        },
      ],
    },
    {
      student_id: studentMap.get("24PGP002").id, // Ananya Iyer
      jd_id: googleJd.id,
      status: "applied",
      round_history: [],
    },
    {
      student_id: studentMap.get("24PGP003").id, // Rohan Verma
      jd_id: googleJd.id,
      status: "interview",
      round_history: [
        {
          round: "Round 2 - Case Presentation & Leadership",
          scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          location: "Executive Boardroom A",
          assigned_by_user_id: spcUser.id,
          assigned_at: new Date().toISOString(),
        },
      ],
    },
    {
      student_id: studentMap.get("24PGP004").id, // Priya Nair
      jd_id: googleJd.id,
      status: "selected",
      round_history: [
        {
          round: "Final Executive Review",
          scheduled_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          location: "Google India HQ",
          assigned_by_user_id: spcUser.id,
          assigned_at: new Date().toISOString(),
        },
      ],
    },
    {
      student_id: studentMap.get("24PGP006").id, // Neha Gupta
      jd_id: googleJd.id,
      status: "waitlisted",
      round_history: [],
    },
    {
      student_id: studentMap.get("24PGP005").id, // Vikramaditya Rao
      jd_id: googleJd.id,
      status: "rejected",
      round_history: [],
    },
  ];

  const appMap = new Map();
  for (const app of googleApps) {
    let { data: appRow } = await supabase
      .from("applications")
      .select("*")
      .eq("student_id", app.student_id)
      .eq("jd_id", app.jd_id)
      .maybeSingle();

    if (!appRow) {
      const { data: created, error } = await supabase
        .from("applications")
        .insert(app)
        .select()
        .single();
      if (error) throw error;
      appRow = created;
    } else {
      await supabase.from("applications").update(app).eq("id", appRow.id);
    }
    appMap.set(app.student_id, appRow);
  }

  // Also applications for Aarav Sharma on other JDs so his /applications screen looks great:
  if (mckinseyJd) {
    await supabase.from("applications").upsert({
      student_id: aaravStudent.id,
      jd_id: mckinseyJd.id,
      status: "under_review",
    }, { onConflict: "student_id,jd_id" });
  }
  if (gsJd) {
    await supabase.from("applications").upsert({
      student_id: aaravStudent.id,
      jd_id: gsJd.id,
      status: "applied",
    }, { onConflict: "student_id,jd_id" });
  }

  // 12. Application Private Notes
  const aaravApp = appMap.get(aaravStudent.id);
  if (aaravApp) {
    const { data: existingNotes } = await supabase
      .from("application_private_notes")
      .select("id")
      .eq("application_id", aaravApp.id);
    if (!existingNotes || existingNotes.length === 0) {
      await supabase.from("application_private_notes").insert({
        application_id: aaravApp.id,
        author_user_id: recruiterUser.id,
        note_text: "Top candidate from technical screening. Outstanding telemetry design experience at Microsoft.",
      });
    }
  }

  // 13. Eligibility Overrides for Google PM
  const siddharthStudent = studentMap.get("24PGP007");
  if (siddharthStudent) {
    await supabase.from("jd_eligibility_overrides").upsert({
      jd_id: googleJd.id,
      student_id: siddharthStudent.id,
      override_type: "include",
      created_by_user_id: adminUser.id,
    }, { onConflict: "jd_id,student_id" });
  }

  // 14. Defaults Records
  const defaultsData = [
    { student_id: aaravStudent.id, activity_name: "Guest Lecture - McKinsey Partner", activity_type: "gl", attended: true, category_total: 1 },
    { student_id: aaravStudent.id, activity_name: "Leadership Summit 2024", activity_type: "summit", attended: false, category_total: 1 },
    { student_id: aaravStudent.id, activity_name: "CV Verification Workshop", activity_type: "process", attended: false, category_total: 1 },
    { student_id: studentMap.get("24PGP005").id, activity_name: "Guest Lecture - FMCG Dynamics", activity_type: "gl", attended: false, category_total: 1 },
    { student_id: studentMap.get("24PGP005").id, activity_name: "Corporate Ethics Seminar", activity_type: "seminar", attended: false, category_total: 1 },
    { student_id: studentMap.get("24PGP005").id, activity_name: "Leadership Summit 2024", activity_type: "summit", attended: false, category_total: 1 },
    { student_id: studentMap.get("24PGP005").id, activity_name: "Mock Interview Round 1", activity_type: "process", attended: false, category_total: 1 },
    { student_id: studentMap.get("24PGP005").id, activity_name: "Alumni Interaction Series", activity_type: "seminar", attended: false, category_total: 1 },
  ];
  for (const d of defaultsData) {
    await supabase.from("default_records").insert(d);
  }

  // 15. Placement Records
  const placementsData = [
    // Current season placement
    {
      student_id: studentMap.get("24PGP004").id, // Priya Nair
      company_id: companyMap.get("Google India").id,
      jd_id: googleJd.id,
      final_ctc: 34,
      role_title: "Product Manager",
      offer_date: "2026-08-15",
    },
    // Past season placements (for comparison analytics)
    {
      student_id: studentMap.get("23PGP011").id,
      company_id: companyMap.get("Google India").id,
      final_ctc: 28,
      role_title: "Associate Product Manager",
      offer_date: "2025-02-10",
    },
    {
      student_id: studentMap.get("23PGP012").id,
      company_id: companyMap.get("McKinsey & Company").id,
      final_ctc: 32,
      role_title: "Junior Associate",
      offer_date: "2025-02-14",
    },
    {
      student_id: studentMap.get("23PGP013").id,
      company_id: companyMap.get("Goldman Sachs").id,
      final_ctc: 30,
      role_title: "Financial Analyst",
      offer_date: "2025-02-20",
    },
  ];
  for (const pl of placementsData) {
    await supabase.from("placement_records").upsert(pl, { onConflict: "student_id" });
  }

  // 16. Outreach Activities for Companies
  const activitiesData = [
    {
      company_id: companyMap.get("Google India").id,
      channel: "email",
      logged_by_user_id: bdUser.id,
      logged_by_name: "Rohan Gupta",
      merge_status: "responded",
      previous_mails_summary: "Shared PGP 2024-26 batch profile sheet and JD intake template. Received positive confirmation from HR leadership.",
      occurred_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      company_id: companyMap.get("Google India").id,
      channel: "call",
      logged_by_user_id: bdUser.id,
      logged_by_name: "Rohan Gupta",
      call_remarks: "Confirmed interview dates for 4 Product Manager positions. Slot allocated for Day 1 morning.",
      spc_remarks: "Room 302 and Virtual Meet link configured.",
      occurred_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      company_id: companyMap.get("McKinsey & Company").id,
      channel: "email",
      logged_by_user_id: bdUser.id,
      logged_by_name: "Rohan Gupta",
      merge_status: "email_opened",
      previous_mails_summary: "Sent customized consulting persona pitch with analytics specialization breakdown.",
      occurred_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    {
      company_id: companyMap.get("Goldman Sachs").id,
      channel: "call",
      logged_by_user_id: bdUser.id,
      logged_by_name: "Rohan Gupta",
      call_remarks: "Discussion with campus recruiter Ananya regarding slotting for quantitative finance roles.",
      occurred_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    },
  ];
  for (const act of activitiesData) {
    await supabase.from("outreach_activities").insert(act);
  }

  // 17. Audit Log entries
  const auditEntries = [
    {
      institute_id: institute.id,
      actor_user_id: adminUser.id,
      action: "batch_created",
      target_entity: "batches",
      target_id: activeBatch.id,
      metadata: { name: "PGP 2024-26", is_active: true },
    },
    {
      institute_id: institute.id,
      actor_user_id: adminUser.id,
      action: "user_approved",
      target_entity: "users",
      target_id: recruiterUser.id,
      metadata: { email: "recruiter@google.com", role: "Recruiter" },
    },
    {
      institute_id: institute.id,
      actor_user_id: adminUser.id,
      action: "jd_published",
      target_entity: "jds",
      target_id: googleJd.id,
      metadata: { role_title: "Product Manager - Core Infrastructure", company: "Google India" },
    },
    {
      institute_id: institute.id,
      actor_user_id: spcUser.id,
      action: "application_shortlisted",
      target_entity: "applications",
      target_id: aaravApp ? aaravApp.id : null,
      metadata: { candidate: "Aarav Sharma", round: "Round 1 - Technical & Product Interview" },
    },
    {
      institute_id: institute.id,
      actor_user_id: adminUser.id,
      action: "eligibility_override_added",
      target_entity: "jd_eligibility_overrides",
      target_id: googleJd.id,
      metadata: { student: "Siddharth Menon", override_type: "include" },
    },
    {
      institute_id: institute.id,
      actor_user_id: adminUser.id,
      action: "placement_confirmed",
      target_entity: "placement_records",
      target_id: studentMap.get("24PGP004").id,
      metadata: { student: "Priya Nair", company: "Google India", ctc: 34 },
    },
  ];
  for (const entry of auditEntries) {
    await supabase.from("audit_log_entries").insert(entry);
  }

  console.log("Seed data successfully completed!");
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
