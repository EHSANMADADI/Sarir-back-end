// middlewares/checkStorageLimit.js
import UserFileModel from "../Models/userFileModel.js";

/**
 * Middleware generator for checking user storage limit
 * @param {string} fileType  
 * @param {number} maxSize 
 */
export function checkStorageLimit(fileType, maxSize = 2 * 1024 * 1024 * 1024) {
  return async function (req, res, next) {
    try {
      const userId = req.userId; // از authMiddleware گرفتیم

      const totalSize = await UserFileModel.aggregate([
        { $match: { userId, type: fileType } },
        { $group: { _id: null, total: { $sum: "$size" } } }
      ]);

      const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;
      if (usedSize >= maxSize) {
        return res.status(402).json({
          error: `شما به سقف حجم مجاز (${(maxSize / (1024 ** 3)).toFixed(2)} GB) برای نوع '${fileType}' رسیده‌اید`
        });
      }

      next();
    } catch (error) {
      console.error("Storage Middleware Error:", error.message);
      return res.status(500).json({ error: "Error checking storage limit" });
    }
  };
}
