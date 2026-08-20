// Split out of src/app/actions/roster.ts: a "use server" file may only
// export async functions, so this plain constant (used by both the action
// and the page that renders the format hint) has to live elsewhere.
export const EXPECTED_ROSTER_COLUMNS =
  "roll_no,name,section,age,gender,branch,cgpa,specialization,total_work_ex_months,personal_email";
