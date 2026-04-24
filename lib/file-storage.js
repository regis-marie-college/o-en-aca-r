"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("./config");

const STORAGE_API_BASE = config.supabase.url
  ? `${config.supabase.url.replace(/\/+$/, "")}/storage/v1`
  : "";
const DEFAULT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
const TMP_UPLOAD_DIR = path.join(os.tmpdir(), "o-en-aca-r-uploads");
const LOCAL_PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const bucketReadyPromises = new Map();

async function readResponseDetails(response) {
  const rawText = await response.text();
  let parsed = null;

  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      parsed = null;
    }
  }

  return {
    rawText,
    parsed,
    message:
      parsed?.message ||
      parsed?.error_description ||
      parsed?.error ||
      rawText ||
      response.statusText,
  };
}

function isBucketMissing(response, details) {
  if (response.status === 404) {
    return true;
  }

  const combinedMessage = String(
    [
      details?.message,
      details?.parsed?.statusCode,
      details?.parsed?.code,
      details?.parsed?.error,
    ]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();

  return (
    combinedMessage.includes("bucket not found") ||
    combinedMessage.includes("not found")
  );
}

function sanitizeFileName(name, fallback = "file") {
  const safeName = String(name || fallback).replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeName || fallback;
}

function buildObjectPath(folder, fileName) {
  return `${folder}/${Date.now()}-${sanitizeFileName(fileName)}`.replace(/^\/+/, "");
}

function getPublicObjectUrl(bucket, objectPath) {
  return `${STORAGE_API_BASE}/object/public/${encodeURIComponent(bucket)}/${encodeURI(objectPath)}`;
}

function canUseSupabaseStorage() {
  return Boolean(STORAGE_API_BASE && config.supabase.role_key);
}

async function ensureTempUploadDir() {
  await fs.promises.mkdir(TMP_UPLOAD_DIR, { recursive: true });
  return TMP_UPLOAD_DIR;
}

async function ensureBucket(bucket) {
  if (bucketReadyPromises.has(bucket)) {
    return bucketReadyPromises.get(bucket);
  }

  const readyPromise = ensureBucketExists(bucket).catch((error) => {
    bucketReadyPromises.delete(bucket);
    throw error;
  });

  bucketReadyPromises.set(bucket, readyPromise);
  return readyPromise;
}

async function ensureBucketExists(bucket) {
  const response = await fetch(`${STORAGE_API_BASE}/bucket/${encodeURIComponent(bucket)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.supabase.role_key}`,
      apikey: config.supabase.role_key,
    },
  });

  if (response.ok) {
    return;
  }

  const details = await readResponseDetails(response);

  if (!isBucketMissing(response, details)) {
    throw new Error(`Failed to access storage bucket: ${details.message}`);
  }

  const createResponse = await fetch(`${STORAGE_API_BASE}/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.supabase.role_key}`,
      apikey: config.supabase.role_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: null,
      allowed_mime_types: null,
    }),
  });

  if (!createResponse.ok) {
    const createDetails = await readResponseDetails(createResponse);

    if (!/already exists/i.test(createDetails.message)) {
      throw new Error(`Failed to create storage bucket: ${createDetails.message}`);
    }
  }
}

async function uploadToSupabaseStorage({ uploadedFile, folder, fallbackName }) {
  const originalName =
    uploadedFile.originalFilename || uploadedFile.newFilename || fallbackName;
  const objectPath = buildObjectPath(folder, originalName);
  const fileBuffer = await fs.promises.readFile(uploadedFile.filepath);

  await ensureBucket(DEFAULT_BUCKET);

  const uploadObject = async () =>
    fetch(
      `${STORAGE_API_BASE}/object/${encodeURIComponent(DEFAULT_BUCKET)}/${encodeURI(objectPath)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.supabase.role_key}`,
          apikey: config.supabase.role_key,
          "Content-Type": uploadedFile.mimetype || "application/octet-stream",
          "x-upsert": "false",
        },
        body: fileBuffer,
      },
    );

  let response = await uploadObject();

  if (!response.ok) {
    const details = await readResponseDetails(response);

    if (isBucketMissing(response, details)) {
      await ensureBucket(DEFAULT_BUCKET);
      response = await uploadObject();
    }
  }

  if (!response.ok) {
    const details = await readResponseDetails(response);
    throw new Error(`Failed to upload file to storage: ${details.message}`);
  }

  await fs.promises.unlink(uploadedFile.filepath).catch(() => {});

  return {
    file_name: originalName,
    file_url: getPublicObjectUrl(DEFAULT_BUCKET, objectPath),
  };
}

async function saveToLocalPublicDir({ uploadedFile, folder, fallbackName }) {
  const originalName =
    uploadedFile.originalFilename || uploadedFile.newFilename || fallbackName;
  const finalName = `${Date.now()}-${sanitizeFileName(originalName, fallbackName)}`;
  const outputDir = path.join(LOCAL_PUBLIC_DIR, "uploads", folder);
  const finalPath = path.join(outputDir, finalName);

  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.copyFile(uploadedFile.filepath, finalPath);
  await fs.promises.unlink(uploadedFile.filepath).catch(() => {});

  return {
    file_name: originalName,
    file_url: `/uploads/${folder}/${finalName}`,
  };
}

async function storeUploadedFile(options) {
  if (canUseSupabaseStorage()) {
    return uploadToSupabaseStorage(options);
  }

  return saveToLocalPublicDir(options);
}

module.exports = {
  canUseSupabaseStorage,
  ensureTempUploadDir,
  storeUploadedFile,
};
