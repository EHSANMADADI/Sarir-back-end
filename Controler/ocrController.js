import axios from "axios";
import { minioClient, uploadToMinio } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import readline from "readline";
import { PassThrough } from "stream";
import FormData from "form-data";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

export async function ocrController(req, res) {
  let userId = null;
  const startTime = Date.now();

  try {
    let { objectName, accessToken, translate, source_lang = "fa", target_lang } = req.body;

    if (!objectName || !accessToken) {
      return res.status(400).json({ error: "objectName و accessToken الزامی هستند." });
    }

    if (!Array.isArray(objectName)) objectName = [objectName];

    // --- اعتبارسنجی کاربر ---
    const response = await axios.get(
      "http://localhost:3300/api/UserQuery/GetCurrentUser",
      { headers: { accept: "application/json", Authorization: accessToken } }
    );
    userId = response.data.returnValue?.id;
    if (!userId) return res.status(401).json({ error: "User not found or invalid access token" });

    // --- پیدا کردن رکورد اصلی برای حفظ اسم فارسی ---
    const originalFileRecords = [];
    for (const obj of objectName) {
      const record = await UserFileModel.findOne({
        userId,
        minioObjectName: obj,
        type: "original", // یا نوع فایلی که قبلاً ذخیره شده
      });
      if (!record) return res.status(404).json({ error: `Original file ${obj} not found in DB` });
      originalFileRecords.push(record);
    }
    const originalFilenames = originalFileRecords.map(f => f.originalFilename);

    // --- بررسی رکورد fail قبلی ---
    const failedRecord = await UserFileModel.findOne({
      userId,
      originalFilename: { $in: originalFilenames },
      status: false,
    });

    // --- چک حجم کل استفاده شده ---
    const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    const totalSize = await UserFileModel.aggregate([
      { $match: { userId, type: "ocr" } },
      { $group: { _id: null, total: { $sum: "$size" } } },
    ]);
    const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;
    if (usedSize >= MAX_SIZE) {
      return res.status(402).json({
        error: `شما به سقف حجم مجاز (${(MAX_SIZE / 1024 ** 3).toFixed(2)} GB) رسیده‌اید`,
      });
    }

    // --- آماده‌سازی FormData ---
    const form = new FormData();
    const OCR_URL = process.env.OCR_URL;
    let targetUrl = null;

    const uploadedFiles = [];
    let totalUploadedSize = 0;

    if (objectName.length > 1) {
      targetUrl = `${OCR_URL}/api/mul_image_to_pdf/stream`;
      for (let i = 0; i < objectName.length; i++) {
        const obj = objectName[i];
        const fileStream = await minioClient.getObject("sarirbucket", obj);
        const stat = await minioClient.statObject("sarirbucket", obj);
        totalUploadedSize += stat.size;

        const safeName = `${uuidv4()}-${obj}`;
        form.append("files", fileStream, safeName);

        uploadedFiles.push({
          originalFilename: originalFileRecords[i].originalFilename,
          minioObjectName: safeName,
        });
      }
    } else {
      const obj = objectName[0];
      const fileStream = await minioClient.getObject("sarirbucket", obj);
      const stat = await minioClient.statObject("sarirbucket", obj);
      totalUploadedSize = stat.size;

      const safeName = `${uuidv4()}-${obj}`;
      form.append("file", fileStream, safeName);

      uploadedFiles.push({
        originalFilename: originalFileRecords[0].originalFilename,
        minioObjectName: safeName,
      });

      const isPdf = obj.toLowerCase().endsWith(".pdf");
      targetUrl = isPdf
        ? `${OCR_URL}/api/pdf-to-pdf/stream`
        : `${OCR_URL}/api/image-to-pdf/stream`;
    }

    if (translate !== undefined) form.append("translate", String(translate));
    if (source_lang !== undefined) form.append("source_lang", String(source_lang));
    if (target_lang !== undefined) form.append("target_lang", String(target_lang));

    // --- ارسال به OCR ---
    const ocrRes = await axios.post(targetUrl, form, {
      headers: form.getHeaders(),
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const passStream = new PassThrough();
    ocrRes.data.pipe(passStream);
    res.setHeader("Content-Type", "application/json");
    passStream.pipe(res);

    // --- ذخیره در MinIO و MongoDB ---
    const rl = readline.createInterface({ input: ocrRes.data });
    const ocrResponseList = [];

    rl.on("line", (line) => {
      try {
        ocrResponseList.push(JSON.parse(line.trim()));
      } catch {
        console.warn("خطا در پارس JSON:", line);
      }
    });

    rl.on("close", async () => {
      const responseTime = Date.now() - startTime;

      if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

      const jsonBuffer = Buffer.from(JSON.stringify(ocrResponseList));
      const ocrJsonPath = `ocrResults/${uuidv4()}.json`;
      await minioClient.putObject("sarirbucket", ocrJsonPath, jsonBuffer);

      const newFile = new UserFileModel({
        userId,
        originalFilename: originalFilenames.join(", "), // نام فارسی اصلی
        minioObjectName: uploadedFiles.map(f => f.minioObjectName).join(", "),
        ocrJsonPath,
        size: totalUploadedSize,
        type: "ocr",
        inputIdFile: objectName.join(", "),
        textAsr: null,
        wordASR: null,
        status: true,
        responseTime,
      });
      await newFile.save();
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("خطا در ارسال فایل به OCR:", error);

    if (userId) {
      const existingFailed = await UserFileModel.findOne({
        userId,
        minioObjectName: Array.isArray(req.body.objectName)
          ? req.body.objectName.join(", ")
          : req.body.objectName,
        status: false,
      });
      if (!existingFailed) {
        // تلاش برای گرفتن نام فارسی اصلی از دیتابیس
        const originalFileRecords = [];
        const objectNames = Array.isArray(req.body.objectName) ? req.body.objectName : [req.body.objectName];
        for (const obj of objectNames) {
          const record = await UserFileModel.findOne({
            userId,
            minioObjectName: obj,
            type: "original",
          });
          if (record) originalFileRecords.push(record);
        }
        const originalFilenames = originalFileRecords.map(f => f.originalFilename);

        await UserFileModel.create({
          userId,
          originalFilename: originalFilenames.join(", "),
          minioObjectName: Array.isArray(req.body.objectName)
            ? req.body.objectName.join(", ")
            : req.body.objectName,
          ocrJsonPath: null,
          size: 0,
          type: "ocr",
          inputIdFile: Array.isArray(req.body.objectName)
            ? req.body.objectName.join(", ")
            : req.body.objectName,
          textAsr: null,
          wordASR: null,
          status: false,
          responseTime
        });
      }
    }

    res.status(500).json({ error: "خطا در پردازش فایل", details: error.message });
  }
}
