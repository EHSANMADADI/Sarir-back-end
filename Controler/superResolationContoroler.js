import axios from "axios";
import { minioClient, uploadToMinio } from "../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js";
import UserFileModel from "../Models/userFileModel.js";
import FormData from "form-data";

export async function superResolationContoroler(req, res) {
  let userId = null;
  const startTime = Date.now();
  const bucketName = "sarirbucket";

  try {
    const { objectName, accessToken, category = "SuperResolation" } = req.body;

    if (!objectName || !accessToken) {
      return res
        .status(400)
        .json({ error: "objectName و accessToken الزامی هستند." });
    }

    // --- اعتبارسنجی کاربر
    const response = await axios.get(
      "http://185.83.112.4:3300/api/UserQuery/GetCurrentUser",
      {
        headers: { accept: "application/json", Authorization: accessToken },
      }
    );

    userId = response.data.returnValue?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ error: "User not found or invalid access token" });
    }

    // --- بررسی رکورد fail قبلی
    const failedRecord = await UserFileModel.findOne({
      userId,
      originalFilename: objectName,
      status: false,
    });

    // --- چک حجم کل استفاده شده (2GB limit)
    const MAX_SIZE = 2 * 1024 * 1024 * 1024;
    const totalSize = await UserFileModel.aggregate([
      { $match: { userId: userId, type: "super-resolution" } },
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

    // --- گرفتن فایل به صورت استریم از MinIO
    const fileStream = await minioClient.getObject(bucketName, objectName);

    // --- آماده‌سازی FormData
    const form = new FormData();
    form.append("image", fileStream, objectName);

    // --- ارسال درخواست به سرویس super-resolution
    const SUPER_RESOLATION_URL = process.env.SUPER_RESOLATION_URL;
    const responseSuper = await axios.post(
      `${SUPER_RESOLATION_URL}/gfgpan`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    console.log(responseSuper.data);
    

    const { output_images, zip_file } = responseSuper.data;
    const responseTime = Date.now() - startTime;

    // --- دانلود فایل‌ها و آپلود به MinIO
    const savedFiles = [];
    const downloadAndUpload = async (fileUrl, fileType) => {
      const fileName = `${Date.now()}-${fileUrl.split("/").pop()}`;
      const fullUrl = `${SUPER_RESOLATION_URL}/${fileUrl}`;
      const resp = await axios.get(fullUrl, { responseType: "arraybuffer" });

      const fileData = {
        buffer: Buffer.from(resp.data),
        filename: fileName,
        mimetype: fileType === "image" ? "image/png" : "application/zip",
        userId,
      };

      const result = await uploadToMinio(fileData, category);
      savedFiles.push({ type: fileType, minioObjectName: result.objectName });
      return result.objectName;
    };

    const uploadedImages = [];
    for (const img of output_images) {
      const fileName = await downloadAndUpload(img, "image");
      uploadedImages.push(fileName);
    }

    const zipFileName = await downloadAndUpload(zip_file, "zip");

    // --- حذف رکورد fail قبلی
    if (failedRecord) {
      await UserFileModel.deleteOne({ _id: failedRecord._id });
    }

    // --- ذخیره رکورد موفق
    const newFile = new UserFileModel({
      userId,
      originalFilename: objectName,
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

    // اگر ارور مربوط به دسترسی کاربر باشه → 401
    if (error?.response?.status === 401 || error.message?.includes("401")) {
      return res
        .status(401)
        .json({ error: "User not found or invalid access token" });
    }

    // --- فقط اگر userId وجود داشت رکورد fail ذخیره شود
    if (userId) {
      const existingFailed = await UserFileModel.findOne({
        userId,
        originalFilename: req.body.objectName,
        status: false,
      });

      if (!existingFailed) {
        await new UserFileModel({
          userId,
          originalFilename: req.body.objectName || "",
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

    return res
      .status(500)
      .json({ error: "خطا در پردازش super-resolution.", details: error.message });
  }
}
