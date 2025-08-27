import UserFileModel from '../Models/userFileModel.js';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/MinioClient.js';
import axios from 'axios';
import https from 'https';

export async function reciveSuperFile(req, res) {
    try {
        // دریافت ورودی از body، query و params
        const accessToken =
            req.body.accessToken
        const objectName =
            req.body.objectName

        if (!accessToken || !objectName) {
            return res.status(400).json({ error: "accessToken و objectName الزامی هستند" });
        }

        // --- اعتبارسنجی کاربر
        const agent = new https.Agent({ rejectUnauthorized: false });
        const response = await axios.get(
            "https://185.83.112.4:3300/api/UserQuery/GetCurrentUser",
            {
                httpsAgent: agent,
                headers: {
                    accept: "application/json",
                    Authorization: accessToken,
                },
            }
        );

        const userId = response.data.returnValue.id;
        if (!userId) {
            return res.status(401).json({ error: "User not found or invalid access token" });
        }

        // --- بررسی اینکه این فایل برای این کاربر وجود دارد
        const file = await UserFileModel.findOne({
            userId,
            "responseSuper.output_images": { $in: [objectName] },
        });

        if (!file) {
            return res.status(404).json({ error: "File not found for this user." });
        }

        const bucketName = "sarirbucket";

        // --- ساخت Presigned URL (اعتبار 24 ساعت)
        const presignedUrl = await minioClient.presignedGetObject(
            bucketName,
            objectName, // این همون objectName ذخیره‌شده در MinIO هست
            24 * 60 * 60
        );

        return res.status(200).json({
            message: "File URL generated successfully",
            fileUrl: presignedUrl,
        });

    } catch (err) {
        if (err.status === 401) {
            return res.status(401).json({ error: "User not found or invalid access token" });
        }
        console.error("Error retrieving file:", err);
        res.status(500).json({ error: "Server error", details: err.message });
    }
}
