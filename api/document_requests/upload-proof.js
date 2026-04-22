const { formidable } = require("formidable");
const { okay, badRequest, notAllowed } = require("../../lib/response");
const {
  ensureTempUploadDir,
  storeUploadedFile,
} = require("../../lib/file-storage");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const uploadDir = await ensureTempUploadDir();

    const form = formidable({
      multiples: false,
      uploadDir,
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

    const uploadedFile = Array.isArray(files.proof_of_payment)
      ? files.proof_of_payment[0]
      : files.proof_of_payment;

    if (!uploadedFile) {
      throw new Error("Proof of payment file is required");
    }

    const result = await storeUploadedFile({
      uploadedFile,
      folder: "proofs",
      fallbackName: "proof",
    });

    return okay(res, result);
  } catch (error) {
    console.error(error);
    return badRequest(res, error.message || "Failed to upload proof of payment");
  }
};
