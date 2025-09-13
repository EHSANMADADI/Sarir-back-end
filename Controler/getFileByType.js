import UserFileModel from '../Models/userFileModel.js';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import axios from 'axios';
import https from 'https';
export const getUserFilesByType = async (req, res) => {
  try {
    const { accessToken, type } = req.query;

    if (!accessToken || !type) {
      return res.status(400).json({ message: 'فیلدهای accessToken و type الزامی هستند.' });
    }
    var userId

    const response = await axios.get('http://localhost:3300/api/UserQuery/GetCurrentUser', {
      headers: {
        'accept': 'application/json',
        'Authorization': accessToken
      }
    });


    userId = response.data.returnValue.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not found or invalid access token' });
    }



    // جستجو در دیتابیس
    const files = await UserFileModel.find({ userId, type }).sort({ createdAt: -1 });
    console.log(files);


    if (files.length === 0) {
      return res.status(404).json({ message: 'هیچ فایلی با این مشخصات یافت نشد.' });
    }
    const bucketName = "sarirbucket";

    // ساخت لینک موقت برای هر فایل
    const filesWithLinks = await Promise.all(
      files.map(async (file) => {
        const url = await minioClient.presignedGetObject(
          bucketName,
          file.minioObjectName,
          600 * 600 // مدت اعتبار لینک: ۱ ساعت
        );
        return {
          ...file.toObject(),
          fileUrl: url,
          displayName: file.originalFilename // ✅ اسم اصلی فارسی

        };
      })
    );


    return res.status(200).json({
      count: filesWithLinks.length,
      files: filesWithLinks
    });

  } catch (error) {
    console.error('خطا در دریافت فایل‌ها:', error);
    if (error.status == 401) {
      return res.status(401).json({ error: 'User not found or invalid access token' });

    }
    return res.status(500).json({ message: 'خطای سرور. لطفا بعدا تلاش کنید.' });
  }

};