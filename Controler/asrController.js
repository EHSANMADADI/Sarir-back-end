import axios from "axios";
import { minioClient } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import { v4 as uuidv4 } from "uuid";
import FormData from "form-data";
import https from "https";

export async function asrController(req, res) {
  const startTime = Date.now();
  let userId = null;

  try {
    const { objectName, accessToken, language, n_params, mode } = req.body;
    const bucketName = "sarirbucket";

    if (!objectName || !accessToken) {
      return res
        .status(400)
        .json({ error: "objectName and accessToken are required" });
    }

    // احراز هویت کاربر
    const responsee = await axios.get(
      "http://185.83.112.4:3300/api/UserQuery/GetCurrentUser",
      {
        headers: {
          accept: "application/json",
          Authorization: accessToken,
        },
      }
    );

    userId = responsee.data.returnValue.id;
    if (!userId)
      return res
        .status(401)
        .json({ error: "User not found or invalid access token" });

    // حذف رکورد fail قبلی در صورت موفقیت
    const failedRecord = await UserFileModel.findOne({
      userId,
      originalFilename: objectName,
      status: false,
    });

    // دریافت فایل از MinIO
    const fileStream = await minioClient.getObject(bucketName, objectName);

    // ساخت FormData برای API ASR
    const formData = new FormData();
    formData.append("file", fileStream, {
      filename: `${uuidv4()}-${objectName}`,
    });
    if (language) formData.append("language", language);
    if (n_params) formData.append("n_params", n_params);
    if (mode) formData.append("mode", mode);

    // خواندن از config/env
    const ASR_URL = process.env.ASR_URL_Javad ;

    // ارسال فایل به API ASR
    const response = await axios.post(`${ASR_URL}/api/transcribe/file`, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
    });

    const { transcription, word } = response.data;
    console.log("asr",response.data);
    
    const totalTime = Date.now() - startTime;

    // حذف رکورد fail قبلی
    if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

    // ذخیره رکورد موفق
    const newFile = new UserFileModel({
      userId,
      originalFilename: objectName,
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

    // فقط اگر رکورد fail قبلی وجود نداشت
    const existingFailed = await UserFileModel.findOne({
      userId,
      originalFilename: req.body.objectName,
      status: false,
    });

    if (!existingFailed) {
      await new UserFileModel({
        userId: userId || null,
        originalFilename: req.body.objectName || "",
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

    if (err.status == 401) {
      return res
        .status(401)
        .json({ error: "User not found or invalid access token" });
    }

    return res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
}
