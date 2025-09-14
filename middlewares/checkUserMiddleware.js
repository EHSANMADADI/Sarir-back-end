// middlewares/checkUserMiddleware.js
import axios from "axios";

export async function checkUserMiddleware(req, res, next) {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken is required" });
    }

    const response = await axios.get(
      "http://localhost:3300/api/UserQuery/GetCurrentUser",
      { headers: { accept: "application/json", Authorization: accessToken } }
    );

    const userId = response.data.returnValue?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not found or invalid access token" });
    }

    // ✅ ذخیره userId در req برای استفاده در کنترلر
    req.userId = userId;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);
    return res.status(401).json({ error: "Authentication failed" });
  }
}
