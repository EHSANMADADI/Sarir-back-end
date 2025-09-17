import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import mime from 'mime-types';

// مسیر در Express: از * برای گرفتن کل مسیر استفاده می‌کنیم
// app.get("/downloadUserFile/*", downloadUserFile);

export const downloadUserFile = async (req, res) => {
  try {
    // کل مسیر بعد از /downloadUserFile/ را می‌گیریم
    const objectName = req.params[0]; 
    const bucketName = "sarirbucket";

    if (!objectName) {
      return res.status(400).json({ message: "objectName is required" });
    }

    // بررسی اینکه فایل وجود دارد یا نه
    const stat = await minioClient.statObject(bucketName, objectName).catch(() => null);
    if (!stat) {
      return res.status(404).json({ message: "File not found" });
    }

    // گرفتن استریم فایل از MinIO
    const fileStream = await minioClient.getObject(bucketName, objectName);

    // تعیین MIME type بر اساس پسوند فایل
    const mimeType = mime.lookup(objectName) || "application/octet-stream";

    // هدرها برای پخش استریم در مرورگر
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${objectName.split('/').pop()}"`);
    res.setHeader("Accept-Ranges", "bytes"); // برای پلیر مرورگر ضروری است

    // استریم مستقیم فایل به مرورگر
    fileStream.pipe(res);

  } catch (error) {
    console.error("خطا :", error);
    return res.status(500).json({ message: error.message });
  }
};
