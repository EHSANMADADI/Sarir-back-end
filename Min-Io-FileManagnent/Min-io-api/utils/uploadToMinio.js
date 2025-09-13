// utils/minioUploader.js
const { v4: uuidv4 } = require("uuid");
const Minio = require("minio");
const path = require("path");
const dotenv = require("dotenv");
const mime = require("mime-types");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// MinIO Client Setup
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT, 10),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const bucketName = process.env.MINIO_BUCKET;

// Ensure bucket exists
async function ensureBucketExists() {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName, "eu-central-1");
      console.log(`Bucket "${bucketName}" created.`);
    }
  } catch (err) {
    console.error("Bucket check error:", err.message);
    throw err;
  }
}
ensureBucketExists();

const uploadToMinio = async (fileData, category = "default") => {
  const fileId = uuidv4();

  // استخراج پسوند از mimetype یا نام فایل
  const ext =
    mime.extension(fileData.mimetype) ||
    path.extname(fileData.filename) ||
    "bin";

  // ✅ اسم امن برای ذخیره در MinIO
  const objectName = `${category}/${fileId}.${ext}`;

  await minioClient.putObject(
    bucketName,
    objectName,
    fileData.buffer,
    fileData.buffer.length,
    {
      "Content-Type": fileData.mimetype,
      "x-amz-meta-fileid": fileId,
      // اسم اصلی فقط Encode شده ذخیره میشه (برای جلوگیری از خطا)
      "x-amz-meta-filename": encodeURIComponent(fileData.filename || ""),
      "x-amz-meta-category": category,
      "x-amz-meta-userid": fileData.userId || "",
    }
  );

  return {
    fileId,
    objectName,
    category,
    size: fileData.buffer.length,
    mimetype: fileData.mimetype,
    userId: fileData.userId || null,
    originalFilename: fileData.filename, // فقط برای برگردوندن به دیتابیس
  };
};

module.exports = {
  uploadToMinio,
  minioClient,
  bucketName,
};
