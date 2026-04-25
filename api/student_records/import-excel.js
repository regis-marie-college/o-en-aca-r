const fs = require("fs");
const { formidable } = require("formidable");
const XLSX = require("xlsx");
const { okay, badRequest, notAllowed } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const { ensureTempUploadDir } = require("../../lib/file-storage");

const HEADER_ALIASES = {
  student_id: [
    "studentnumber",
    "studentno",
    "studentid",
    "student_id",
    "student_number",
    "idnumber",
    "idno",
  ],
  last_name: ["lastname", "surname", "last_name", "familyname"],
  first_name: ["firstname", "givenname", "first_name"],
  middle_name: ["middlename", "middle_name", "middlenameinitial", "mi"],
  course_id: ["subjectcode", "coursecode", "code", "subject_code", "course_code"],
  course_name: [
    "courseorsubjectname",
    "subjectorcourse",
    "subjectorcourse_name",
    "subjectname",
    "coursename",
    "subject",
    "course",
    "subjecttitle",
    "course_title",
  ],
  program_name: ["program", "courseprogram", "degreeprogram", "programname"],
  school_year: ["schoolyear", "academic_year", "academicyear", "sy"],
  semester: ["semester", "term"],
  units: ["units", "unit"],
  grade: ["grade", "grades", "finalgrade", "final_grade"],
  remarks: ["remarks", "remark", "status"],
  academic_status: ["academicstatus", "studentstatus"],
  year_level: ["yearlevel", "year_level", "level"],
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeProgram(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCellValue(row, aliases) {
  const entries = Object.entries(row || {});
  for (const [key, value] of entries) {
    const normalizedKey = normalizeHeader(key);
    if (aliases.includes(normalizedKey)) {
      return value;
    }
  }

  return "";
}

function toText(value) {
  return String(value ?? "").trim();
}

function toNullableNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildCourseId(courseId, courseName) {
  const rawCourseId = toText(courseId);
  if (rawCourseId) {
    return rawCourseId;
  }

  const rawCourseName = toText(courseName);
  if (!rawCourseName) {
    return "IMPORTED";
  }

  return rawCourseName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50) || "IMPORTED";
}

function extractRowData(row) {
  const studentId = toText(getCellValue(row, HEADER_ALIASES.student_id));
  const lastName = toText(getCellValue(row, HEADER_ALIASES.last_name));
  const firstName = toText(getCellValue(row, HEADER_ALIASES.first_name));
  const middleName = toText(getCellValue(row, HEADER_ALIASES.middle_name));
  const courseName = toText(getCellValue(row, HEADER_ALIASES.course_name));
  const programName = toText(getCellValue(row, HEADER_ALIASES.program_name));
  const schoolYearRaw = toText(getCellValue(row, HEADER_ALIASES.school_year));
  const semester = toText(getCellValue(row, HEADER_ALIASES.semester));
  const remarks = toText(getCellValue(row, HEADER_ALIASES.remarks));
  const academicStatus = toText(getCellValue(row, HEADER_ALIASES.academic_status));
  const yearLevel = toText(getCellValue(row, HEADER_ALIASES.year_level));

  return {
    student_id: studentId,
    last_name: lastName,
    first_name: firstName,
    middle_name: middleName,
    course_name: courseName,
    course_id: buildCourseId(getCellValue(row, HEADER_ALIASES.course_id), courseName),
    program_name: programName,
    school_year: schoolYearRaw || "Imported",
    academic_year: schoolYearRaw || null,
    semester,
    units: toNullableNumber(getCellValue(row, HEADER_ALIASES.units)),
    grade: toNullableNumber(getCellValue(row, HEADER_ALIASES.grade)),
    remarks,
    academic_status: academicStatus,
    year_level: yearLevel,
  };
}

function getStudentLookupKeys(student) {
  const byId = String(student.student_number || student.id || "").trim();
  const firstName = normalizeName(student.first_name);
  const lastName = normalizeName(student.last_name);
  const middleName = normalizeName(student.middle_name);
  const fullName = [lastName, firstName, middleName].filter(Boolean).join("|");
  const noMiddle = [lastName, firstName].filter(Boolean).join("|");

  return { byId, fullName, noMiddle };
}

async function parseUpload(req) {
  const tempUploadDir = await ensureTempUploadDir();

  const form = formidable({
    multiples: false,
    uploadDir: tempUploadDir,
    keepExtensions: true,
    maxFiles: 1,
  });

  const { files, fields } = await new Promise((resolve, reject) => {
    form.parse(req, (error, parsedFields, parsedFiles) => {
      if (error) {
        return reject(error);
      }

      return resolve({ files: parsedFiles, fields: parsedFields });
    });
  });

  const uploadedFile = Array.isArray(files.grade_file)
    ? files.grade_file[0]
    : files.grade_file;

  if (!uploadedFile) {
    throw new Error("Excel grade file is required");
  }

  return {
    uploadedFile,
    encodedBy: Array.isArray(fields.encoded_by)
      ? fields.encoded_by[0]
      : fields.encoded_by,
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "records"]);
  if (!auth) {
    return;
  }

  let uploadedFile = null;

  try {
    const parsed = await parseUpload(req);
    uploadedFile = parsed.uploadedFile;
    const encodedBy = toText(parsed.encodedBy) || "Records Excel Import";

    const workbook = XLSX.readFile(uploadedFile.filepath, { cellDates: false });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("Excel file does not contain any worksheet");
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (!rows.length) {
      throw new Error("Excel worksheet is empty");
    }

    const studentsResult = await db.query(
      `
      select id, student_number, first_name, middle_name, last_name, email
      from users
      where type = 'student'
      `,
    );

    const programsResult = await db.query(
      `
      select id, name, code
      from programs
      order by name asc
      `,
    );

    const validPrograms = new Map();
    programsResult.rows.forEach((program) => {
      const nameKey = normalizeProgram(program.name);
      const codeKey = normalizeProgram(program.code);

      if (nameKey) {
        validPrograms.set(nameKey, program.name);
      }

      if (codeKey) {
        validPrograms.set(codeKey, program.name);
      }
    });

    const studentById = new Map();
    const studentByName = new Map();

    studentsResult.rows.forEach((student) => {
      const keys = getStudentLookupKeys(student);
      if (keys.byId) {
        studentById.set(keys.byId.toLowerCase(), student);
      }
      if (keys.fullName) {
        studentByName.set(keys.fullName, student);
      }
      if (keys.noMiddle) {
        studentByName.set(keys.noMiddle, student);
      }
    });

    const existingRecordsResult = await db.query(
      `
      select student_id, course_id, course_name, coalesce(academic_year, school_year) as record_year, coalesce(semester, '') as semester, coalesce(grade::text, '') as grade
      from student_records
      `,
    );

    const existingRecordKeys = new Set(
      existingRecordsResult.rows.map((record) =>
        [
          String(record.student_id || "").toLowerCase(),
          normalizeName(record.course_id),
          normalizeName(record.course_name),
          normalizeName(record.record_year),
          normalizeName(record.semester),
          normalizeName(record.grade),
        ].join("|"),
      ),
    );

    const imported = [];
    const skipped = [];

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const rowData = extractRowData(rows[index]);

      if (
        !rowData.student_id &&
        !rowData.last_name &&
        !rowData.first_name &&
        !rowData.course_name &&
        rowData.grade === null
      ) {
        skipped.push({ row: rowNumber, reason: "Blank row" });
        continue;
      }

      if (!rowData.course_name || rowData.grade === null) {
        skipped.push({
          row: rowNumber,
          reason: "Missing course/subject name or grade",
        });
        continue;
      }

      if (!rowData.program_name) {
        skipped.push({
          row: rowNumber,
          reason: "Missing program",
        });
        continue;
      }

      const normalizedProgram = normalizeProgram(rowData.program_name);
      const matchedProgramName = validPrograms.get(normalizedProgram) || "";

      if (!matchedProgramName) {
        skipped.push({
          row: rowNumber,
          reason: "Program is not recognized",
          program_name: rowData.program_name,
        });
        continue;
      }

      rowData.program_name = matchedProgramName;

      let matchedStudent = null;
      let matchType = "";

      if (rowData.student_id) {
        matchedStudent = studentById.get(rowData.student_id.toLowerCase()) || null;
        if (matchedStudent) {
          matchType = "student_id";
        }
      }

      if (!matchedStudent) {
        const fullNameKey = [
          normalizeName(rowData.last_name),
          normalizeName(rowData.first_name),
          normalizeName(rowData.middle_name),
        ]
          .filter(Boolean)
          .join("|");
        const noMiddleKey = [
          normalizeName(rowData.last_name),
          normalizeName(rowData.first_name),
        ]
          .filter(Boolean)
          .join("|");

        matchedStudent =
          studentByName.get(fullNameKey) ||
          studentByName.get(noMiddleKey) ||
          null;

        if (matchedStudent) {
          matchType = fullNameKey ? "name" : "";
        }
      }

      if (!matchedStudent) {
        skipped.push({
          row: rowNumber,
          reason: "Student not found using student number/id and name",
          student_id: rowData.student_id,
          name: [rowData.last_name, rowData.first_name, rowData.middle_name]
            .filter(Boolean)
            .join(", "),
        });
        continue;
      }

      const dedupeKey = [
        String(matchedStudent.id || "").toLowerCase(),
        normalizeName(rowData.course_id),
        normalizeName(rowData.course_name),
        normalizeName(rowData.academic_year || rowData.school_year),
        normalizeName(rowData.semester),
        normalizeName(rowData.grade),
      ].join("|");

      if (existingRecordKeys.has(dedupeKey)) {
        skipped.push({
          row: rowNumber,
          reason: "Duplicate academic record already exists",
          student_id: matchedStudent.id,
          course_name: rowData.course_name,
        });
        continue;
      }

      const studentName = [
        matchedStudent.first_name,
        matchedStudent.middle_name,
        matchedStudent.last_name,
      ]
        .filter(Boolean)
        .join(" ");

      const insertResult = await db.query(
        `
        insert into student_records
        (
          student_id,
          student_name,
          course_id,
          course_name,
          school_year,
          semester,
          units,
          grade,
          remarks,
          academic_status,
          program_name,
          year_level,
          academic_year,
          encoded_by
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        returning *
        `,
        [
          matchedStudent.id,
          studentName,
          rowData.course_id,
          rowData.course_name,
          rowData.school_year,
          rowData.semester || null,
          rowData.units,
          rowData.grade,
          rowData.remarks || null,
          rowData.academic_status || null,
          rowData.program_name || null,
          rowData.year_level || null,
          rowData.academic_year || null,
          encodedBy,
        ],
      );

      existingRecordKeys.add(dedupeKey);
      imported.push({
        row: rowNumber,
        student_id: matchedStudent.id,
        student_name: studentName,
        program_name: insertResult.rows[0].program_name,
        course_name: insertResult.rows[0].course_name,
        grade: insertResult.rows[0].grade,
        matched_by: matchType,
      });
    }

    return okay(res, {
      worksheet: firstSheetName,
      total_rows: rows.length,
      imported_count: imported.length,
      skipped_count: skipped.length,
      imported,
      skipped,
      supported_programs: programsResult.rows.map((program) => ({
        name: program.name,
        code: program.code,
      })),
      expected_columns: [
        "Student Number",
        "Last Name",
        "First Name",
        "Middle Name",
        "Program",
        "Course or Subject Name",
        "Grade",
        "Course ID",
        "School Year",
        "Semester",
        "Units",
        "Remarks",
      ],
    });
  } catch (error) {
    console.error(error);
    return badRequest(res, error.message || "Failed to import Excel grade records");
  } finally {
    if (uploadedFile?.filepath) {
      fs.promises.unlink(uploadedFile.filepath).catch(() => {});
    }
  }
};
