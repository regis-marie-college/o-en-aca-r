const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      drop constraint if exists enrollments_request_type_check;

    update enrollments
    set request_type = 'New Student'
    where request_type is null
      or trim(request_type) = '';

    update enrollments
    set request_type = 'Walk-in Student'
    where lower(trim(request_type)) in ('walk-in student', 'walk in student', 'walk_in_student');

    alter table enrollments
      add constraint enrollments_request_type_check
      check (
        coalesce(request_type, 'New Student') in (
          'New Student',
          'Walk-in Student',
          'Transferee',
          'Irregular Student',
          'Returning Student'
        )
      );
  `);

  console.log("walk-in enrollment request type allowed");
}

async function down() {
  await db.query(`
    update enrollments
    set request_type = 'New Student'
    where request_type = 'Walk-in Student';

    alter table enrollments
      drop constraint if exists enrollments_request_type_check;

    alter table enrollments
      add constraint enrollments_request_type_check
      check (
        coalesce(request_type, 'New Student') in (
          'New Student',
          'Transferee',
          'Irregular Student',
          'Returning Student'
        )
      );
  `);

  console.log("walk-in enrollment request type removed");
}

module.exports = {
  up,
  down,
};
