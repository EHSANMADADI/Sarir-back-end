import axios from 'axios';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import UserFileModel from '../Models/userFileModel.js';
import FormData from 'form-data';
import path from 'path';
import dotenv from "dotenv";

dotenv.config();

export async function graphController(req, res) {
  const startTime = Date.now();
  let userId = null;

  try {
    const { objectName, accessToken } = req.body;
    const bucketName = "sarirbucket";
    const graph_url = process.env.graph_url;

    if (!objectName || !accessToken) {
      return res.status(400).json({ error: 'objectName و accessToken الزامی هستند.' });
    }

    // --- 1️⃣ اعتبارسنجی کاربر ---
    const userResponse = await axios.get(
      'http://localhost:3300/api/UserQuery/GetCurrentUser',
      { headers: { accept: 'application/json', Authorization: accessToken } }
    );

    userId = userResponse.data.returnValue?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not found or invalid access token' });
    }

    // --- 2️⃣ پیدا کردن رکورد اصلی برای حفظ اسم فارسی ---
    const originalFileRecord = await UserFileModel.findOne({
      userId,
      minioObjectName: objectName,
      type: "original",
    });
    if (!originalFileRecord) {
      return res.status(404).json({ error: 'Original file record not found' });
    }
    const originalFilename = originalFileRecord.originalFilename;

    // --- 3️⃣ بررسی رکورد fail قبلی ---
    const failedRecord = await UserFileModel.findOne({
      userId,
      originalFilename,
      status: false
    });

    // --- 4️⃣ محدودیت حجم ---
    const MAX_SIZE = 2 * 1024 * 1024 * 1024;
    const totalSize = await UserFileModel.aggregate([
      { $match: { userId, type: 'vad' } },
      { $group: { _id: null, total: { $sum: "$size" } } }
    ]);
    const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;
    if (usedSize >= MAX_SIZE) {
      return res.status(402).json({
        error: `شما به سقف حجم مجاز (${(MAX_SIZE / (1024 ** 3)).toFixed(2)} GB) رسیده‌اید`
      });
    }

    // --- 5️⃣ گرفتن فایل از MinIO ---
    const fileStream = await minioClient.getObject(bucketName, objectName);

    // --- 6️⃣ آماده‌سازی FormData با نام فایل فارسی ---
    const ext = path.extname(originalFilename) || '.png';
    const safeFilename = originalFilename.endsWith(ext) ? originalFilename : originalFilename + ext;

    const formData = new FormData();
    formData.append('file', fileStream, { filename: safeFilename });

    // --- 7️⃣ ارسال فایل به سرویس Graph ---
    const graphResponse = await axios.post(
      `${graph_url}/generate`,
      formData,
      {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
      }
    );

    const responseData = graphResponse.data;
    const responseTime = Date.now() - startTime;

    // --- 8️⃣ حذف رکورد fail قبلی ---
    if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

    // --- 9️⃣ ذخیره رکورد موفق ---
    const newFile = new UserFileModel({
      userId,
      originalFilename, // اسم فارسی
      minioObjectName: objectName,
      MinIofileId: "",
      size: 0,
      type: "vad",
      inputIdFile: objectName,
      textAsr: null,
      wordASR: null,
      responseGraph: responseData,
      status: true,
      responseTime
    });
    await newFile.save();

    return res.status(200).json({
      message: 'Graph processing completed successfully',
      data: responseData,
      mongoRecordedId: newFile._id
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('خطا در Graph Controller:', error);

    // --- ذخیره رکورد fail ---
    if (userId) {
      const existingFailed = await UserFileModel.findOne({
        userId,
        originalFilename: req.body.objectName,
        status: false
      });

      if (!existingFailed) {
        const originalFileRecord = await UserFileModel.findOne({
          userId,
          minioObjectName: req.body.objectName,
          type: "original"
        });
        const originalFilename = originalFileRecord?.originalFilename || "";

        await new UserFileModel({
          userId,
          originalFilename,
          minioObjectName: req.body.objectName || "",
          MinIofileId: "",
          size: 0,
          type: "vad",
          inputIdFile: req.body.objectName || "",
          textAsr: null,
          wordASR: null,
          responseGraph: null,
          status: false,
          responseTime
        }).save();
      }
    }

    if (error?.response?.status === 401 || error.message?.includes("401")) {
      return res.status(401).json({ error: 'User not found or invalid access token' });
    }

    return res.status(500).json({
      error: 'خطا در پردازش Graph',
      details: error.message
    });
  }
}
