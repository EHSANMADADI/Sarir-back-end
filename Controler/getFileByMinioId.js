import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import UserFileModel from '../Models/userFileModel.js';

export const getFileByMinioId = async (req, res) => {
  const { MinIofileId } = req.params;

  try {
    // 1. بررسی وجود فایل در MongoDB
    const file = await UserFileModel.findOne({ MinIofileId });

    if (!file) {
      return res.status(404).json({ message: 'فایل مورد نظر یافت نشد' });
    }

    const bucketName = 'sarirbucket'; 
    const objectName = file.minioObjectName;

    // 2. بررسی وجود فایل در MinIO
    const stat = await minioClient.statObject(bucketName, objectName);

    res.setHeader('Content-Disposition', `attachment; filename="${file.originalFilename}"`);
    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);

    // 3. واکشی فایل از MinIO و ارسال به کلاینت
    const fileStream = await minioClient.getObject(bucketName, objectName);
    fileStream.pipe(res);

  } catch (error) {
    console.error('خطا در دریافت فایل:', error);
    res.status(500).json({ message: 'خطا در واکشی فایل', error: error.message });
  }
};
