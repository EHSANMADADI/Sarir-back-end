import axios from "axios";
import { minioClient, uploadToMinio } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import FormData from "form-data";
import path from "path";
import mime from "mime-types";

export async function superResolationContoroler(req, res) {
  const startTime = Date.now();
  let userId = null;
  const bucketName = "sarirbucket";

  try {
    const { objectName, accessToken, category = "SuperResolation" } = req.body;

    if (!objectName || !accessToken) {
      return res.status(400).json({ error: "objectName و accessToken الزامی هستند." });
    }

    // --- 1️⃣ اعتبارسنجی کاربر ---
    const response = await axios.get("http://localhost:3300/api/UserQuery/GetCurrentUser", {
      headers: { accept: "application/json", Authorization: accessToken },
    });

    userId = response.data.returnValue?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not found or invalid access token" });
    }

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

    // --- 4️⃣ بررسی حجم استفاده شده ---
    const MAX_SIZE = 2 * 1024 * 1024 * 1024;
    const totalSize = await UserFileModel.aggregate([
      { $match: { userId, type: "super-resolution" } },
      { $group: { _id: null, total: { $sum: "$size" } } },
    ]);
    const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;
    if (usedSize >= MAX_SIZE) {
      return res.status(402).json({
        error: `شما به سقف حجم مجاز (${(MAX_SIZE / 1024 ** 3).toFixed(2)} GB) رسیده‌اید`,
      });
    }

    // --- 5️⃣ گرفتن فایل از MinIO ---
    const fileStream = await minioClient.getObject(bucketName, objectName);

    // --- 6️⃣ آماده‌سازی FormData با پسوند صحیح ---
    const ext = path.extname(originalFilename) || ".png";
    const safeFilename = originalFilename.endsWith(ext) ? originalFilename : originalFilename + ext;

    const form = new FormData();
    form.append("image", fileStream, { filename: safeFilename });

    // --- 7️⃣ ارسال به سرویس super-resolution ---
    const SUPER_RESOLATION_URL = process.env.SUPER_RESOLATION_URL;
    const responseSuper = await axios.post(`${SUPER_RESOLATION_URL}/gfgpan`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const { output_images, zip_file } = responseSuper.data;
    const responseTime = Date.now() - startTime;

    // --- 8️⃣ دانلود فایل‌ها و آپلود به MinIO ---
    const savedFiles = [];
    const downloadAndUpload = async (fileUrl, type) => {
      const fileName = `${Date.now()}-${fileUrl.split("/").pop()}`;
      const fullUrl = `${SUPER_RESOLATION_URL}/${fileUrl}`;
      const resp = await axios.get(fullUrl, { responseType: "arraybuffer" });

      const fileData = {
        buffer: Buffer.from(resp.data),
        filename: fileName,
        mimetype: type === "image" ? "image/png" : "application/zip",
        userId,
      };
      const result = await uploadToMinio(fileData, category);
      savedFiles.push({ type, minioObjectName: result.objectName });
      return result.objectName;
    };

    const uploadedImages = [];
    for (const img of output_images) {
      const uploadedName = await downloadAndUpload(img, "image");
      uploadedImages.push(uploadedName);
    }

    const zipFileName = await downloadAndUpload(zip_file, "zip");

    // --- 9️⃣ حذف رکورد fail قبلی ---
    if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

    // --- 10️⃣ ذخیره رکورد موفق ---
    const newFile = new UserFileModel({
      userId,
      originalFilename, // اسم فارسی اصلی
      minioObjectName: objectName,
      MinIofileId: "",
      size: 0,
      type: "super-resolution",
      inputIdFile: objectName,
      textAsr: null,
      wordASR: null,
      responseOcr: null,
      responseSuper: {
        output_images: uploadedImages,
        zip_file: zipFileName,
      },
      status: true,
      responseTime,
    });
    await newFile.save();

    return res.status(200).json({
      message: "Super-resolution completed successfully",
      response: responseSuper.data,
      mongoRecordedId: newFile._id,
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("خطا در Super Resolution:", error);

    // --- ذخیره رکورد fail اگر userId موجود است ---
    if (userId) {
      const existingFailed = await UserFileModel.findOne({
        userId,
        originalFilename: req.body.objectName,
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
          userId,
          originalFilename,
          minioObjectName: req.body.objectName || "",
          MinIofileId: "",
          size: 0,
          type: "super-resolution",
          inputIdFile: req.body.objectName || "",
          textAsr: null,
          wordASR: null,
          responseOcr: null,
          responseSuper: null,
          status: false,
          responseTime,
        }).save();
      }
    }

    if (error?.response?.status === 401 || error.message?.includes("401")) {
      return res.status(401).json({ error: "User not found or invalid access token" });
    }

    return res.status(500).json({
      error: "خطا در پردازش super-resolution.",
      details: error.message,
    });
  }
}
