-- Placement OS — default_records needs a natural key before it can support
-- a re-importable CSV upload (FR-6.3), same reasoning as the students
-- (batch_id, roll_no) unique constraint in 0001: without one, re-importing
-- the same defaults sheet just duplicates rows and silently inflates every
-- student's Total Defaults count.
alter table default_records add constraint default_records_student_activity_unique
  unique (student_id, activity_name);
