import axios from 'axios';
import dotenv from "dotenv";
import workspaceModel from '../Models/workspaceModel.js';
import UserFileModel from '../Models/userFileModel.js'; // 👈 اضافه شد

dotenv.config();

// ✅ 1️⃣ ایجاد workspace جدید
export async function workspaceController(req, res) {
    try {
        const  {accessToken, workspaceName } = req.body;

        if (!accessToken || !workspaceName) {
            return res.status(400).json({ error: 'objectName, accessToken و workspaceName الزامی هستند' });
        }

        // --- validate user ---
        const response = await axios.get(
            'http://localhost:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        const userId = response.data.returnValue?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        // --- create and save workspace ---
        const newWorkspace = new workspaceModel({
            workspaceName,
            userId
        });

        await newWorkspace.save();

        res.status(201).json({
            message: "Workspace created successfully",
            workspace: newWorkspace
        });

    } catch (error) {
        if (error?.response?.status === 401) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}

// ✅ 2️⃣ دریافت لیست workspace های کاربر
export async function getUserWorkspaces(req, res) {
    try {
        const { accessToken } = req.body;

        if (!accessToken) {
            return res.status(400).json({ error: 'accessToken الزامی است' });
        }

        // --- validate user ---
        const response = await axios.get(
            'http://localhost:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        const userId = response.data.returnValue?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        // --- fetch user workspaces ---
        const workspaces = await workspaceModel.find({ userId }).sort({ createdAt: -1 });

        res.status(200).json({
            message: "User workspaces fetched successfully",
            workspaces
        });

    } catch (error) {
        if (error?.response?.status === 401) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}

export async function deleteWorkspace(req, res) {
    try {
        const { workspaceId } = req.params;
        const { accessToken } = req.body; // اگه accessToken از بدنه میاد، اشکال نداره

        if (!accessToken || !workspaceId) {
            return res.status(400).json({ error: 'accessToken و workspaceId الزامی هستند' });
        }

        // --- validate user ---
        const response = await axios.get(
            'http://localhost:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        const userId = response.data.returnValue?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        // --- find and delete workspace owned by the user ---
        const deletedWorkspace = await workspaceModel.findOneAndDelete({
            _id: workspaceId,
            userId: userId
        });

        if (!deletedWorkspace) {
            return res.status(404).json({ error: 'Workspace not found or not owned by this user' });
        }

        // --- mark related user files as deleted ---
        await UserFileModel.updateMany(
            { workspaceId, userId },
            { $set: { deletedByUser: true } }
        );

        res.status(200).json({
            message: "Workspace deleted successfully (files marked as deleted)",
            deletedWorkspace
        });

    } catch (error) {
        if (error?.response?.status === 401) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}




// ✅ 4️⃣ تغییر نام workspace
export async function renameWorkspace(req, res) {
    try {
        const { accessToken, workspaceId, newName } = req.body;

        if (!accessToken || !workspaceId || !newName) {
            return res.status(400).json({ error: 'accessToken، workspaceId و newName الزامی هستند' });
        }

        // --- validate user ---
        const response = await axios.get(
            'http://localhost:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        const userId = response.data.returnValue?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        // --- find and update workspace ---
        const updatedWorkspace = await workspaceModel.findOneAndUpdate(
            { _id: workspaceId, userId },
            { $set: { workspaceName: newName } },
            { new: true } // برای برگردوندن نسخه‌ی جدید بعد از ویرایش
        );

        if (!updatedWorkspace) {
            return res.status(404).json({ error: 'Workspace not found or not owned by this user' });
        }

        res.status(200).json({
            message: "Workspace renamed successfully",
            workspace: updatedWorkspace
        });

    } catch (error) {
        if (error?.response?.status === 401) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
}

