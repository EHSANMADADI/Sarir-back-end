import axios from "axios";
export async function ocrDownloadControler(req, res) {
    const { filename } = req.params;
    const OCR_URL = process.env.OCR_URL;


    try {
        // درخواست به API داخلی
        const response = await axios.get(`${OCR_URL}/file/${filename}`, {
            responseType: "stream", // خیلی مهم
        });

        // ست کردن هدر برای دانلود
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );
        res.setHeader(
            "Content-Type",
            response.headers["content-type"] || "application/octet-stream"
        );

        // استریم کردن خروجی مستقیم به کاربر
        response.data.pipe(res);

    } catch (error) {
        console.error("Error fetching file:", error.message);
        res.status(500).json({ message: "Error downloading file" });
    }
}
