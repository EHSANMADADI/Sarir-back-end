import axios from 'axios';
import https from 'https';
import { minioClient, uploadToMinio } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import UserFileModel from '../Models/userFileModel.js';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';
import mime from 'mime-types';
import dotenv from "dotenv";

dotenv.config();

export async function kwsController(req, res) {
    const startTime = Date.now();
    let userId = null;

    try {
        const { 
            objectName,
            supportFiles = [],
            supportName,
            accessToken,
            lang = 'fa',
            category = 'kwsFile'
        } = req.body;

        const bucketName = "sarirbucket";
        const KWS_URL = process.env.KWS_URL;

        if (!objectName || !accessToken || !supportName) {
            return res.status(400).json({ error: 'objectName, supportName and accessToken are required' });
        }

        // --- اعتبارسنجی کاربر ---
        const response = await axios.get(
            'http://localhost:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        userId = response.data.returnValue?.id;
        if (!userId) return res.status(401).json({ error: 'User not found or invalid access token' });

        // --- پیدا کردن رکورد اصلی برای حفظ اسم فارسی ---
        const originalFileRecord = await UserFileModel.findOne({
            userId,
            minioObjectName: objectName,
            type: "original",
        });
        if (!originalFileRecord) return res.status(404).json({ error: "Original file record not found" });

        const mainOriginalFilename = originalFileRecord.originalFilename;

        // --- بررسی رکورد ناموفق قبلی ---
        const failedRecord = await UserFileModel.findOne({
            userId,
            originalFilename: mainOriginalFilename,
            status: false,
            type: category
        });

        // ---- ساخت FormData برای ارسال به سرویس KWS ----
        const form = new FormData();
        form.append("support_name", supportName);
        form.append("lang", lang);

        // --- فایل اصلی با اسم امن ---
        const mainFileStream = await minioClient.getObject(bucketName, objectName);
        const safeMainFilename = `${mainOriginalFilename}`;
        form.append("files", mainFileStream, {
            filename: safeMainFilename,
            contentType: mime.lookup(mainOriginalFilename) || 'application/octet-stream'
        });

        // --- فایل‌های پشتیبان با اسم امن ---
        for (const fileName of supportFiles) {
            const supportFileDoc = await UserFileModel.findOne({
                userId,
                minioObjectName: fileName,
                type: "original"
            });
            const supportOriginalFilename = supportFileDoc?.originalFilename || fileName;
            const supportFileStream = await minioClient.getObject(bucketName, fileName);
            const safeSupportFilename = `${supportOriginalFilename}`;

            form.append("support_files", supportFileStream, {
                filename: safeSupportFilename,
                contentType: mime.lookup(supportOriginalFilename) || 'application/octet-stream'
            });
        }

        // ---- ارسال به سرویس KWS ----
        const kwsResponse = await axios.post(
            `${KWS_URL}/process`,
            form,
            {
                headers: form.getHeaders(),
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                maxBodyLength: Infinity,
            }
        );

        const responseTime = Date.now() - startTime;

        // حذف رکورد fail قبلی در صورت موفقیت
        if (failedRecord) await UserFileModel.deleteOne({ _id: failedRecord._id });

        // ---- ذخیره در دیتابیس ----
        const newRecord = new UserFileModel({
            userId,
            originalFilename: mainOriginalFilename, // اسم فارسی اصلی حفظ شد
            minioObjectName: objectName,
            type: category,
            kwsResponse: kwsResponse.data,
            supportFiles,
            responseTime,
            status: true
        });

        await newRecord.save();

        return res.status(200).json({
            message: "KWS processed successfully",
            response: kwsResponse.data,
            mongoRecordedId: newRecord._id
        });

    } catch (err) {
        const responseTime = Date.now() - startTime;
        console.error("KWS error:", err?.response?.data || err.message);

        try {
            const existingFailed = await UserFileModel.findOne({
                userId,
                minioObjectName: req.body.objectName,
                type: "kwsFile",
                status: false
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
                    type: "kwsFile",
                    kwsResponse: null,
                    supportFiles: req.body.supportFiles || [],
                    responseTime,
                    status: false
                }).save();
            }
        } catch (innerErr) {
            console.error("Error saving failed KWS record:", innerErr);
        }

        if (err?.response?.status === 401) {
            return res.status(401).json({ error: "User not found or invalid access token" });
        }

        return res.status(500).json({
            error: "KWS processing failed",
            details: err?.response?.data || err.message
        });
    }
}
