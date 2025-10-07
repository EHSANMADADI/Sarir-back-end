import axios from 'axios';
import dotenv from "dotenv";
import workspaceModel from '../Models/workSpaceModel.js';

dotenv.config();

export async function workspaceController(req, res) {
    let userId = null;

    try {
        const { accessToken, workspaceName } = req.body;

        if (!accessToken || !workspaceName) {
            return res.status(400).json({ error: 'accessToken و workspaceName الزامی هستند' });
        }

        // --- validate user ---
        const response = await axios.get(
            'http://localhost:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        userId = response.data.returnValue?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        // --- save workspace ---
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