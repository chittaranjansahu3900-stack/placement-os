import { describe, expect, it } from "vitest";
import { previewRosterCsv } from "./roster-csv";

const HEADER = "roll_no,name,section,age,gender,branch,cgpa,specialization,total_work_ex_months,personal_email";

describe("previewRosterCsv", () => {
  it("parses a valid row into validRows with the right graduation/pg shape", () => {
    const { validRows, invalidRows, fileIssues } = previewRosterCsv(
      `${HEADER}\nPGP001,Asha Rao,A,24,Female,Mechanical,8.5,Finance,6,asha@example.com`,
    );
    expect(fileIssues).toEqual([]);
    expect(invalidRows).toEqual([]);
    expect(validRows).toHaveLength(1);
    expect(validRows[0]).toMatchObject({
      roll_no: "PGP001",
      name: "Asha Rao",
      section: "A",
      age: 24,
      gender: "Female",
      graduation_details: { branch: "Mechanical", cgpa: 8.5 },
      pg_details: { specialization: "Finance" },
      total_work_ex_months: 6,
      personal_email: "asha@example.com",
    });
  });

  it("works without a header row (positional columns)", () => {
    const { validRows } = previewRosterCsv("PGP002,Ben Iyer,,,,,,,,");
    expect(validRows).toHaveLength(1);
    expect(validRows[0].roll_no).toBe("PGP002");
    expect(validRows[0].name).toBe("Ben Iyer");
  });

  it("rejects a row missing roll_no or name", () => {
    const { invalidRows } = previewRosterCsv(`${HEADER}\n,No Roll,,,,,,,,\nPGP003,,,,,,,,,`);
    expect(invalidRows).toHaveLength(2);
    expect(invalidRows[0].issues).toContain("Missing roll number");
    expect(invalidRows[1].issues).toContain("Missing student name");
  });

  it("rejects an out-of-range age and CGPA without dropping the rest of the row", () => {
    const { invalidRows } = previewRosterCsv(`${HEADER}\nPGP004,Cy Lin,A,200,,,15,,,`);
    expect(invalidRows).toHaveLength(1);
    expect(invalidRows[0].issues).toEqual(
      expect.arrayContaining([expect.stringContaining("Age"), expect.stringContaining("CGPA")]),
    );
  });

  it("rejects a malformed email", () => {
    const { invalidRows } = previewRosterCsv(`${HEADER}\nPGP005,Dee Shah,,,,,,,,not-an-email`);
    expect(invalidRows[0].issues).toContain("Invalid email address");
  });

  it("does not reject a row with a blank optional email", () => {
    const { validRows } = previewRosterCsv(`${HEADER}\nPGP006,Em Fox,,,,,,,,`);
    expect(validRows).toHaveLength(1);
    expect(validRows[0].personal_email).toBeNull();
  });

  it("flags an unclosed quote as a file-level issue and empties validRows", () => {
    const { fileIssues, validRows } = previewRosterCsv(`${HEADER}\nPGP007,"Unterminated,,,,,,,,`);
    expect(fileIssues.length).toBeGreaterThan(0);
    expect(validRows).toEqual([]);
  });

  it("supports a reordered header", () => {
    const { validRows } = previewRosterCsv("name,roll_no\nFio Gray,PGP008");
    expect(validRows[0]).toMatchObject({ roll_no: "PGP008", name: "Fio Gray" });
  });

  it("maps every persisted Profile Sheet section, including the four new Student columns", () => {
    const csv = [
      "Roll Number,Student Name,Serial No,Section,Age,Gender,Mobile Number,Email ID,graduation_college,graduation_branch,graduation_cgpa,graduation_year,graduation_backlog_count,pg_specialization,pg_cgpa,pg_year,tenth_school,tenth_board,tenth_year,tenth_percentage,twelfth_school,twelfth_board,twelfth_year,twelfth_percentage,total_work_ex_months,employer_1_company,employer_1_role,employer_1_duration_months,employer_2_company,employer_2_role,employer_2_duration_months,employer_3_company,employer_3_role,employer_3_duration_months,project_1_name,project_1_role,project_1_period,project_1_link,project_1_description,position_1_organization,position_1_role,position_1_period,position_1_description,credentials,other_qualifications",
      'PGP009,Gia Sen,9,B,25,Female,9876543210,gia@example.com,NIT Rourkela,Electrical,8.4,2023,0,Marketing,3.6,2027,DAV,CBSE,2017,94,DAV,CBSE,2019,91,30,TCS,Analyst,12,Infosys,Consultant,12,Startup,Intern,6,Demand Forecasting,Analyst,2026,https://example.com,"Built baseline, presented results",Finance Club,Treasurer,2025,Managed budget,"Google Analytics;NSE Module","Advanced Excel;French A2"',
    ].join("\n");
    const { validRows, invalidRows } = previewRosterCsv(csv);
    expect(invalidRows).toEqual([]);
    expect(validRows[0]).toMatchObject({
      display_seq: 9,
      section: "B",
      age: 25,
      gender: "Female",
      phone: "9876543210",
      graduation_details: { college: "NIT Rourkela", branch: "Electrical", cgpa: 8.4, backlog_count: 0, year: 2023 },
      pg_details: { specialization: "Marketing", cgpa: 3.6, year: 2027 },
      tenth_twelfth_details: {
        tenth: { school: "DAV", board: "CBSE", year: "2017", result: "94" },
        twelfth: { school: "DAV", board: "CBSE", year: "2019", result: "91" },
      },
      total_work_ex_months: 30,
      other_qualifications: "Advanced Excel;French A2",
    });
    expect(validRows[0].prior_employers).toHaveLength(3);
    expect(validRows[0].credentials).toEqual(expect.arrayContaining([
      "Google Analytics",
      "NSE Module",
      expect.objectContaining({ type: "project", name: "Demand Forecasting" }),
      expect.objectContaining({ type: "position_of_responsibility", role: "Treasurer" }),
    ]));
  });

  it("validates repeated employer details instead of importing an orphan role", () => {
    const { invalidRows } = previewRosterCsv("roll_no,name,employer_1_role\nPGP010,Hari Das,Analyst");
    expect(invalidRows[0].issues).toContain("Employer 1 company is required when employer details are present");
  });
});
