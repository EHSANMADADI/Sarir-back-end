import axios from "axios";
import { minioClient } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import readline from "readline";
import https from "https";
import { PassThrough } from "stream";
import FormData from "form-data";

export async function ocrController(req, res) {
  let userId = null;
  const startTime = Date.now();

  try {
    let { objectName, accessToken } = req.body;

    if (!objectName || !accessToken) {
      return res
        .status(400)
        .json({ error: "objectName و accessToken الزامی هستند." });
    }

    if (!Array.isArray(objectName)) objectName = [objectName];

    // --- اعتبارسنجی کاربر ---
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.get(
      "https://185.83.112.4:3300/api/UserQuery/GetCurrentUser",
      {
        httpsAgent: agent,
        headers: { accept: "application/json", Authorization: accessToken },
      }
    );

    userId = response.data.returnValue.id;
    if (!userId)
      return res
        .status(401)
        .json({ error: "User not found or invalid access token" });

    // --- بررسی رکورد fail قبلی ---
    const failedRecord = await UserFileModel.findOne({
      userId,
      originalFilename: { $in: objectName },
      status: false,
    });

    // --- چک حجم کل استفاده شده ---
    const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    const totalSize = await UserFileModel.aggregate([
      { $match: { userId: userId, type: "ocr" } },
      { $group: { _id: null, total: { $sum: "$size" } } },
    ]);
    const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;
    if (usedSize >= MAX_SIZE) {
      return res.status(402).json({
        error: `شما به سقف حجم مجاز (${(MAX_SIZE / 1024 ** 3).toFixed(
          2
        )} GB) رسیده‌اید`,
      });
    }

    // --- آماده‌سازی FormData ---
    const form = new FormData();
    const OCR_URL = process.env.OCR_URL;
    let targetUrl = null;

    if (objectName.length > 1) {
      targetUrl = `${OCR_URL}/api/mul_image_to_pdf/stream`;
      for (const obj of objectName) {
        const fileStream = await minioClient.getObject("sarirbucket", obj);
        form.append("files", fileStream, obj);
      }
    } else {
      const singleObject = objectName[0];
      const fileStream = await minioClient.getObject("sarirbucket", singleObject);
      form.append("file", fileStream, singleObject);

      const isPdf = singleObject.toLowerCase().endsWith(".pdf");
      targetUrl = isPdf
        ? `${OCR_URL}/api/pdf-to-pdf/stream`
        : `${OCR_URL}/api/image-to-pdf/stream`;
    }

    // --- ارسال به OCR ---
    const ocrRes = await axios.post(targetUrl, form, {
      headers: form.getHeaders(),
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // --- PassThrough برای استریم به کاربر ---
    const passStream = new PassThrough();
    ocrRes.data.pipe(passStream);

    // مسیر اول: استریم مستقیم به کاربر
    res.setHeader("Content-Type", "application/json");
    passStream.pipe(res);

    // مسیر دوم: خواندن برای ذخیره در MinIO
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

      // حذف fail قبلی
      if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

      // ذخیره JSON در MinIO
      const jsonBuffer = Buffer.from(JSON.stringify(ocrResponseList));
      const ocrJsonPath = `ocrResults/${objectName.join("_")}_${Date.now()}.json`;
      await minioClient.putObject("sarirbucket", ocrJsonPath, jsonBuffer);

      // ذخیره رکورد در MongoDB با مسیر فایل
      const ocrResult = new UserFileModel({
        userId,
        originalFilename: objectName.join(", "),
        minioObjectName: objectName.join(", "),
        ocrJsonPath,   // مسیر فایل ذخیره شده در MinIO
        size: 0,
        type: "ocr",
        inputIdFile: objectName.join(", "),
        textAsr: null,
        wordASR: null,
        status: true,
        responseTime,
      });
      await ocrResult.save();
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("خطا در ارسال فایل به OCR:", error);

    if (userId) {
      const existingFailed = await UserFileModel.findOne({
        userId,
        originalFilename: Array.isArray(req.body.objectName)
          ? req.body.objectName.join(", ")
          : req.body.objectName,
        status: false,
      });
      if (!existingFailed) {
        await new UserFileModel({
          userId,
          originalFilename: Array.isArray(req.body.objectName)
            ? req.body.objectName.join(", ")
            : req.body.objectName,
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
          responseTime,
        }).save();
      }
    }

    res.status(500).json({ error: "خطا در پردازش فایل" });
  }
}
