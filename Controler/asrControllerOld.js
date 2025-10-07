import axios from "axios";
import { minioClient } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import { v4 as uuidv4 } from "uuid";
import FormData from "form-data";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// ساخت __dirname در ESModule
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function asrControllerOld(req, res) {
  const startTime = Date.now();
  let userId = null;
  let tempFilePath = null; // مسیر فایل موقت برای پاک‌سازی بعدی
  try {
    const { objectName, accessToken, language, n_params, mode } = req.body;
    const bucketName = "sarirbucket";
    const ASR_URL_OLD = process.env.ASR_URL_OLD;

    if (!objectName || !accessToken || !language || !n_params || !mode) {
      return res
        .status(400)
        .json({ error: "objectName and accessToken and language and params and mode are required" });
    }

    // احراز هویت کاربر
    const userResponse = await axios.get("http://localhost:3300/api/UserQuery/GetCurrentUser", {
      headers: {
        accept: "application/json",
        Authorization: accessToken,
      },
    });

    userId = userResponse.data.returnValue?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not found or invalid access token" });
    }

    // پیدا کردن رکورد اصلی فایل
    const originalFileRecord = await UserFileModel.findOne({
      userId,
      minioObjectName: objectName,
      type: "original",
    });

    if (!originalFileRecord) {
      return res.status(404).json({ error: "Original file record not found" });
    }

    const originalFilename = originalFileRecord.originalFilename;

    // مسیر ذخیره فایل موقت
    const tempDir = path.join(__dirname, "../tmp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, `${uuidv4()}-${originalFilename}`);

    // دریافت فایل از MinIO و ذخیره روی دیسک
    const fileStream = await minioClient.getObject(bucketName, objectName);
    const writeStream = fs.createWriteStream(tempFilePath);
    await new Promise((resolve, reject) => {
      fileStream.pipe(writeStream);
      fileStream.on("end", resolve);
      fileStream.on("error", reject);
    });

    // سایز فایل (بر حسب بایت)
    const stats = fs.statSync(tempFilePath);
    const fileSize = stats.size;

    // ساخت FormData با فایل روی دیسک
    const formData = new FormData();
    formData.append("file", fs.createReadStream(tempFilePath));
    formData.append("language", language);
    formData.append("n_params", n_params);
    formData.append("mode", mode);

    // ارسال فایل به API ASR
    console.log("asr old started");

    const response = await axios.post(`${ASR_URL_OLD}/api/transcribe/file`, formData);
    

    const { transcription, word } = response.data;
    const totalTime = Date.now() - startTime;

    // ذخیره رکورد موفق
    const newFile = new UserFileModel({
      userId,
      originalFilename,
      minioObjectName: objectName,
      MinIofileId: "",
      size: fileSize, // سایز فایل
      type: "ASR",
      inputIdFile: objectName,
      textAsr: transcription,
      wordASR: Object.values(word || {}),
      status: true,
      responseTime: totalTime,
    });

    await newFile.save();
    console.info("asr completed");

    return res.status(200).json({
      message: "ASR completed and data stored successfully",
      response: response.data,
      mongoRecordedId: newFile._id,
    });
  } catch (err) {
    console.error("Error in asrController:", err);
    const totalTime = Date.now() - startTime;

    try {
      const existingFailed = await UserFileModel.findOne({
        userId,
        minioObjectName: req.body.objectName,
        status: false,
      });

      if (!existingFailed) {
        const originalFileRecord = await UserFileModel.findOne({
          userId,
          minioObjectName: req.body.objectName,
          type: "original",
        });

        const originalFilename = originalFileRecord?.originalFilename || "";

        await new UserFileModel({
          userId: userId || null,
          originalFilename,
          minioObjectName: req.body.objectName || "",
          MinIofileId: "",
          size: 0,
          type: "ASR",
          inputIdFile: req.body.objectName || "",
          textAsr: null,
          wordASR: [],
          status: false,
          responseTime: totalTime,
        }).save();
      }
    } catch (innerErr) {
      console.error("Error saving failed ASR record:", innerErr);
    }

    if (err?.response?.status === 401) {
      return res.status(401).json({ error: "User not found or invalid access token" });
    }

    return res.status(500).json({ error: "Internal server error", details: err.message });
  } finally {
    // حذف فایل موقت در هر صورت (چه موفق چه خطا)
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log("Temporary file deleted:", tempFilePath);
      } catch (cleanupErr) {
        console.error("Error deleting temporary file:", cleanupErr);
      }
    }
  }
}
