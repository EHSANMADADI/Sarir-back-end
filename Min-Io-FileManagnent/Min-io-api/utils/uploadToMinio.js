// utils/minioUploader.js
const { v4: uuidv4 } = require("uuid");
const Minio = require("minio");

const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
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
  const objectName = `${category}/${fileId}-${fileData.filename}`;

  await minioClient.putObject(
    bucketName,
    objectName,
    fileData.buffer,
    fileData.buffer.length,
    {
      "Content-Type": fileData.mimetype,
      "x-amz-meta-fileid": fileId,
      "x-amz-meta-filename": fileData.filename,
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
    originalFilename: fileData.filename, // اضافه‌شده

  };
};

module.exports = {
  uploadToMinio,
  minioClient,
  bucketName,
};
