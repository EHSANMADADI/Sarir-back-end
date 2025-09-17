import UserFileModel from '../Models/userFileModel.js';
import axios from 'axios';

export const getUserFilesByType = async (req, res) => {
  try {
    const { accessToken, type } = req.query;

    if (!accessToken || !type) {
      return res.status(400).json({ message: 'فیلدهای accessToken و type الزامی هستند.' });
    }

    // دریافت userId از API خارجی
    const response = await axios.get('http://localhost:3300/api/UserQuery/GetCurrentUser', {
      headers: {
        'accept': 'application/json',
        'Authorization': accessToken
      }
    });

    const userId = response.data.returnValue.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not found or invalid access token' });
    }

    // جستجو در دیتابیس
    const files = await UserFileModel.find({ userId, type }).sort({ createdAt: -1 });

    if (files.length === 0) {
      return res.status(404).json({ message: 'هیچ فایلی با این مشخصات یافت نشد.' });
    }

    // ساخت لینک‌های API خودت
    const backendBaseUrl = `${req.protocol}://${req.get("host")}`; 
    const filesWithLinks = files.map((file) => {
      return {
        ...file.toObject(),
        fileUrl: `${backendBaseUrl}/reciveFile/api/files/${file.minioObjectName}`, // ✅ لینک به بک‌اند خودت
        displayName: file.originalFilename // ✅ اسم اصلی فارسی
      };
    });

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
