import axios from "axios";
import { minioClient } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import { v4 as uuidv4 } from "uuid";
import FormData from "form-data";

export async function asrController(req, res) {
  const startTime = Date.now();
  let userId = null;

  try {
    const { objectName, accessToken} = req.body;
    const bucketName = "sarirbucket";

    if (!objectName || !accessToken) {
      return res.status(400).json({ error: "objectName and accessToken are required" });
    }

    // احراز هویت کاربر
    const userResponse = await axios.get(
      "http://localhost:3300/api/UserQuery/GetCurrentUser",
      {
        headers: {
          accept: "application/json",
          Authorization: accessToken,
        },
      }
    );

    userId = userResponse.data.returnValue?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not found or invalid access token" });
    }

    // پیدا کردن رکورد اصلی فایل برای حفظ اسم اصلی فارسی
    const originalFileRecord = await UserFileModel.findOne({
      userId,
      minioObjectName: objectName,
      type: "original",
    });

    if (!originalFileRecord) {
      return res.status(404).json({ error: "Original file record not found" });
    }

    const originalFilename = originalFileRecord.originalFilename;

    // حذف رکورد fail قبلی در صورت وجود
    const failedRecord = await UserFileModel.findOne({
      userId,
      originalFilename,
      status: false,
    });

    // دریافت فایل از MinIO
    const fileStream = await minioClient.getObject(bucketName, objectName);

    // ساخت FormData برای ارسال به API ASR
    const formData = new FormData();
    formData.append("file", fileStream, { filename: `${uuidv4()}-${originalFilename}` });
    

    const ASR_URL = process.env.ASR_URL_Javad;

    // ارسال فایل به API ASR
    const response = await axios.post(`${ASR_URL}/asr`, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
    });

    const { transcription, word } = response.data;
    const totalTime = Date.now() - startTime;

    // حذف رکورد fail قبلی
    if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

    // ذخیره رکورد موفق ASR
    const newFile = new UserFileModel({
      userId,
      originalFilename,        // حفظ اسم اصلی فارسی
      minioObjectName: objectName,
      MinIofileId: "",
      size: 0,
      type: "ASR",
      inputIdFile: objectName,
      textAsr: transcription,
      wordASR: Object.values(word || {}),
      status: true,
      responseTime: totalTime,
    });

    await newFile.save();

    return res.status(200).json({
      message: "ASR completed and data stored successfully",
      response: response.data,
      mongoRecordedId: newFile._id,
    });

  } catch (err) {
    console.error("Error in asrController:", err);
    const totalTime = Date.now() - startTime;

    // ذخیره رکورد fail در صورت عدم وجود
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
  }
}
