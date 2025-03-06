import express, { Request, Response } from 'express';
import { google } from 'googleapis';
import multer from 'multer';
import { getGoogleAuth } from '../sheets'; // Reuse the same auth function
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Upload file to Google Drive
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folderId = process.env.VITE_GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      throw new Error('VITE_GOOGLE_DRIVE_FOLDER_ID environment variable is not set');
    }

    const auth = await getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    // Parse metadata from the request
    const metadata = JSON.parse(req.body.metadata || '{}');
    const fileMetadata = {
      name: metadata.name || req.file.originalname,
      mimeType: metadata.mimeType || req.file.mimetype,
      parents: metadata.parents || [folderId],
    };

    console.log('Uploading file to Google Drive:', {
      name: fileMetadata.name,
      mimeType: fileMetadata.mimeType,
      folderId
    });

    // Create a readable stream from the uploaded file
    const media = {
      mimeType: fileMetadata.mimeType,
      body: fs.createReadStream(req.file.path),
    };

    // Upload file to Google Drive
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webContentLink, webViewLink',
    });

    console.log('File uploaded successfully:', {
      id: file.data.id,
      webContentLink: file.data.webContentLink,
      webViewLink: file.data.webViewLink
    });

    // Clean up the temporary file
    fs.unlinkSync(req.file.path);

    res.json({
      id: file.data.id,
      webContentLink: file.data.webContentLink,
      webViewLink: file.data.webViewLink,
    });
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    res.status(500).json({ error: 'Failed to upload file to Google Drive' });
  }
});

export default router; 