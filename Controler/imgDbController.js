import axios from "axios";
import { minioClient } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import FormData from "form-data";

export async function imgDbController(req, res) {
  const startTime = Date.now();
  let userId = null;

  try {
    const { objectName, accessToken } = req.body;

    if (!objectName || !accessToken) {
      return res.status(400).json({ error: "objectName و accessToken الزامی هستند." });
    }

    // --- 1️⃣ احراز هویت کاربر ---
    const userResponse = await axios.get(
      "http://localhost:3300/api/UserQuery/GetCurrentUser",
      { headers: { accept: "application/json", Authorization: accessToken } }
    );

    userId = userResponse.data.returnValue?.id;
    if (!userId) return res.status(401).json({ error: "User not found or invalid access token" });

    // --- 2️⃣ پیدا کردن رکورد اصلی برای حفظ اسم فارسی ---
    const originalFileRecord = await UserFileModel.findOne({
      userId,
      minioObjectName: objectName,
      type: "original",
    });

    if (!originalFileRecord) {
      return res.status(404).json({ error: "Original file record not found" });
    }

    const originalFilename = originalFileRecord.originalFilename;

    // --- 3️⃣ بررسی رکورد fail قبلی ---
    const failedRecord = await UserFileModel.findOne({
      userId,
      originalFilename,
      status: false,
    });

    // --- 4️⃣ گرفتن فایل از MinIO ---
    const fileStream = await minioClient.getObject("sarirbucket", objectName);

    // --- 5️⃣ ساخت FormData و ارسال به API پردازش ---
    const formData = new FormData();
    formData.append("file", fileStream, { filename: originalFilename });

    const apiResponse = await axios.post(
      "http://192.168.4.177:17020/api/image-to-DB",
      formData,
      { headers: formData.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
    );

    const totalTime = Date.now() - startTime;

    // --- حذف رکورد fail قبلی ---
    if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

    // --- ذخیره رکورد موفق ---
    const newFile = new UserFileModel({
      userId,
      originalFilename,   // ✅ اسم فارسی حفظ شد
      minioObjectName: objectName,
      MinIofileId: "",
      size: 0,
      type: "IMGdb",
      inputIdFile: objectName,
      textAsr: null,
      wordASR: null,
      status: true,
      responseTime: totalTime,
      responseSuper: null,
      responseImgDb: apiResponse.data.lm_studio_result,
    });
    await newFile.save();

    return res.status(200).json({
      message: "IMAGEdB completed and data stored successfully",
      response: apiResponse.data.lm_studio_result,
      mongoRecordedId: newFile._id,
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("Error in imgDbController:", error);

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

        await UserFileModel.create({
          userId: userId || null,
          originalFilename,  // حفظ نام فارسی
          minioObjectName: req.body.objectName || "",
          MinIofileId: "",
          size: 0,
          type: "IMGdb",
          inputIdFile: req.body.objectName || "",
          textAsr: null,
          wordASR: [],
          status: false,
          responseTime,
          responseSuper: null,
        });
      }
    } catch (innerErr) {
      console.error("Error saving failed IMGdb record:", innerErr);
    }

    if (error?.response?.status === 401)
      return res.status(401).json({ error: "User not found or invalid access token" });

    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
