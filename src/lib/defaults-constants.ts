// Split out for the same reason as roster-constants.ts: a "use server" file
// may only export async functions.
export const EXPECTED_DEFAULTS_COLUMNS = "roll_no,activity_name,activity_type,attended,category_total";
export const DEFAULTS_ACTIVITY_TYPES = "gl, summit, process, seminar";
