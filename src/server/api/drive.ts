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

    console.log('Initializing Drive API client with individual credentials');
    
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

// Handle file upload to Google Drive
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('File upload request received');
    
    if (!req.file) {
      console.error('No file in request');
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { file } = req;
    console.log('File received:', { name: file.originalname, size: file.size, type: file.mimetype });

    let metadata;
    try {
      metadata = JSON.parse(req.body.metadata);
      console.log('Metadata received:', metadata);
    } catch (error) {
      console.error('Error parsing metadata:', error);
      res.status(400).json({ error: 'Invalid metadata format', details: error instanceof Error ? error.message : String(error) });
      return;
    }

    console.log('Creating Google Drive instance...');
    const drive = await getDriveClient();
    
    // Create a readable stream from the buffer
    const fileStream = new Readable();
    fileStream.push(file.buffer);
    fileStream.push(null);

    console.log('Uploading file to Google Drive...', {
      name: metadata.name,
      mimeType: metadata.mimeType,
      parents: metadata.parents
    });
    
    const response = await drive.files.create({
      requestBody: {
        name: metadata.name,
        mimeType: metadata.mimeType,
        parents: metadata.parents,
      },
      media: {
        mimeType: metadata.mimeType,
        body: fileStream,
      },
      fields: 'id, webViewLink, webContentLink',
    });

    if (!response.data.id) {
      console.error('No file ID in Google Drive response');
      throw new Error('Failed to get file ID from Google Drive response');
    }

    console.log('File uploaded successfully, ID:', response.data.id);

    console.log('Setting file permissions...');
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    console.log('Sending response to client...');
    res.json({
      id: response.data.id,
      webViewLink: response.data.webViewLink,
      webContentLink: response.data.webContentLink,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    let errorMessage = 'Failed to upload file';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
    } else if (typeof error === 'object' && error !== null) {
      // Handle Google API errors
      const apiError = error as any;
      if (apiError.errors && apiError.errors.length > 0) {
        errorMessage = apiError.errors[0].message;
        errorDetails = JSON.stringify(apiError.errors);
      }
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails,
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 