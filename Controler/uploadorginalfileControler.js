
import UserFileModel from '../Models/userFileModel.js';
import { uploadToMinio } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js'
import axios from 'axios';
import https from 'https';

export async function UploadOrginalFile(req, res) {
  try {
    const startTime = Date.now(); // ذخیره زمان شروع
    const { accessToken, category = "original" } = req.body;
    const file = req.file;


    if (!file || !accessToken) {
      return res.status(400).json({ error: 'File and accessToken are required' });
    }
    var userId
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });
    const response = await axios.get('https://185.83.112.4:3300/api/UserQuery/GetCurrentUser', {
      httpsAgent: agent,
      headers: {
        'accept': 'application/json',
        'Authorization': accessToken
      }
    });

    userId = response.data.returnValue.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not found or invalid access token' });
    }

    
        // حداکثر حجم مجاز برای هر کاربر (اینجا ۲ گیگابایت)
        const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

        // مجموع حجم فایل‌های کاربر برای یک type خاص (مثلا ASR) را محاسبه کن
        const totalSize = await UserFileModel.aggregate([
            { $match: { userId: userId, type: 'original' } },
            { $group: { _id: null, total: { $sum: "$size" } } }
        ]);

        // اگر قبلاً رکوردی داشته، حجم را از آرایه بگیر
        const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;

        // اگر حجم فعلی کاربر به اضافه فایل جدید بیشتر از حد مجاز باشد
        if (usedSize >= MAX_SIZE) {
            return res.status(402).json({
                error: `شما به سقف حجم مجاز (${(MAX_SIZE / (1024 ** 3)).toFixed(2)} GB) رسیده‌اید`
            });
        }


    // 1. ذخیره فایل در MinIO
    const minioResult = await uploadToMinio({
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
      userId,
    }, category);
    console.log('MinIo save', minioResult)

    // 2. ذخیره اطلاعات در MongoDB
    const responseTime = Date.now() - startTime;

    const savedRecord = await UserFileModel.create({
      userId,
      originalFilename: file.originalname,
      minioObjectName: minioResult.objectName,
      MinIofileId: minioResult.fileId,  // Id file in Minio 
      size: minioResult.size,
      mimetype: minioResult.mimetype,
      type: 'original',
      inputIdFile: null,
      textAsr: null,
      status: true,
      responseTime:responseTime
    });
    console.log("seve in mongo");


    return res.status(201).json({
      message: 'File uploaded and saved to MongoDB successfully',
      MinIofileId: minioResult.fileId,
      mongoRecordId: savedRecord._id,
      minioObjectName: savedRecord.minioObjectName
    });
  } catch (err) {
    console.error('Server error:', err);
    console.log(err);
    if (err.status == 401) {
      return res.status(401).json({ error: 'User not found or invalid access token' });

    }

    return res.status(500).json({ error: 'Server error' });
  }


}