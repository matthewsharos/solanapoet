import { Router } from 'express';
import multer from 'multer';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { Request, Response } from 'express';
import { drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Google Drive API client
export const getDriveClient = async () => {
  try {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Google credentials not set. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables');
    }

    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error('Google Drive folder ID not set. Please set GOOGLE_DRIVE_FOLDER_ID environment variable');
    }

    console.log('Initializing Drive API client with credentials');
    
    // Process private key to handle escaped newlines
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (privateKey && !privateKey.includes('\n') && privateKey.includes('\\n')) {
      console.log('Converting escaped newlines in private key to actual newlines');
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const client = await auth.getClient();
    console.log('Successfully created Drive API client');
    return google.drive({ version: 'v3', auth: client as OAuth2Client });
  } catch (error) {
    console.error('Error initializing Google Drive API:', error);
    throw error;
  }
};

// Upload file to Google Drive
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const drive = await getDriveClient();
    const fileMetadata = {
      name: req.file.originalname,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!]
    };

    const media = {
      mimeType: req.file.mimetype,
      body: Readable.from(req.file.buffer)
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink'
    });

    res.json({
      success: true,
      fileId: file.data.id,
      fileName: file.data.name,
      webViewLink: file.data.webViewLink
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 