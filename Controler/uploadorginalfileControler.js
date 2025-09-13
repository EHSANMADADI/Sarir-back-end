import UserFileModel from '../Models/userFileModel.js';
import { v4 as uuidv4 } from 'uuid';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/MinioClient.js';
import axios from 'axios';

export async function UploadOrginalFile(req, res) {
  try {
    const startTime = Date.now();
    const { accessToken, category = "original" } = req.body;
    const file = req.file;

    if (!file || !accessToken) {
      return res.status(400).json({ error: 'File and accessToken are required' });
    }

    // دریافت اطلاعات کاربر
    const response = await axios.get('http://localhost:3300/api/UserQuery/GetCurrentUser', {
      headers: {
        'accept': 'application/json',
        'Authorization': accessToken
      }
    });

    const userId = response.data.returnValue?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not found or invalid access token' });
    }

    // محدودیت حجم کل برای هر کاربر (۲ گیگ)
    const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

    const totalSize = await UserFileModel.aggregate([
      { $match: { userId: userId, type: 'original' } },
      { $group: { _id: null, total: { $sum: "$size" } } }
    ]);
    const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;

    if (usedSize + file.size > MAX_SIZE) {
      return res.status(402).json({
        error: `شما به سقف حجم مجاز (${(MAX_SIZE / (1024 ** 3)).toFixed(2)} GB) رسیده‌اید`
      });
    }

    // ✅ ساختن نام امن برای ذخیره در MinIO
    const fileExt = file.originalname.split('.').pop();
    const safeFileName = `${uuidv4()}.${fileExt}`;

    // ✅ ذخیره فایل در MinIO
    const bucketName = "sarirbucket";
    await minioClient.putObject(bucketName, safeFileName, file.buffer, {
      'Content-Type': file.mimetype,
    });

    // ✅ ذخیره اطلاعات در MongoDB
    const originalNameUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const responseTime = Date.now() - startTime;
    const savedRecord = await UserFileModel.create({
      userId,
      originalFilename: originalNameUtf8,   // اسم اصلی (فارسی)
      minioObjectName: safeFileName,        // اسم امن برای MinIO
      MinIofileId: uuidv4(),                // یک ID یکتا برای فایل (می‌تونی نگه داری)
      size: file.size,
      mimetype: file.mimetype,
      type: 'original',
      inputIdFile: null,
      textAsr: null,
      status: true,
      responseTime
    });

    return res.status(201).json({
      message: 'File uploaded and saved to MongoDB successfully',
      mongoRecordId: savedRecord._id,
      minioObjectName: savedRecord.minioObjectName,
      originalFilename: savedRecord.originalFilename,
    });

  } catch (err) {
    console.error('Server error:', err);

    if (err?.response?.status === 401) {
      return res.status(401).json({ error: 'User not found or invalid access token' });
    }

    return res.status(500).json({ error: 'Server error' });
  }
}
