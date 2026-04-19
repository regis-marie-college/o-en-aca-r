const fs = require("fs");
const path = require("path");
const { formidable } = require("formidable");
const { okay, badRequest, notAllowed } = require("../../lib/response");

const UPLOAD_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "public",
  "uploads",
  "id-pictures",
);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });

    const form = formidable({
      multiples: false,
      uploadDir: UPLOAD_DIR,
      keepExtensions: true,
      maxFiles: 1,
    });

    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (error, fields, parsedFiles) => {
        if (error) {
          return reject(error);
        }

        return resolve({ fields, files: parsedFiles });
      });
    });

    const uploadedFile = Array.isArray(files.id_picture)
      ? files.id_picture[0]
      : files.id_picture;

    if (!uploadedFile) {
      throw new Error("1x1 ID picture file is required");
    }

    const originalName =
      uploadedFile.originalFilename || uploadedFile.newFilename || "id-picture";
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalName = `${Date.now()}-${safeName}`;
    const finalPath = path.join(UPLOAD_DIR, finalName);

    await fs.promises.rename(uploadedFile.filepath, finalPath);

    return okay(res, {
      file_name: originalName,
      file_url: `/uploads/id-pictures/${finalName}`,
    });
  } catch (error) {
    console.error(error);
    return badRequest(res, error?.message || "Failed to upload 1x1 ID picture");
  }
};
