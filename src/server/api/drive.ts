import { Router } from 'express';
import multer from 'multer';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { Request, Response } from 'express';
import { drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Google Drive auth
const getGoogleAuth = async () => {
  try {
    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
      throw new Error('GOOGLE_CREDENTIALS_JSON environment variable is not set');
    }

    console.log('Initializing auth using credentials from GOOGLE_CREDENTIALS_JSON');
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    return auth;
  } catch (error) {
    console.error('Error initializing Google auth:', error);
    throw error;
  }
};

// Create a Google Drive instance using service account
const getDriveInstance = async (): Promise<drive_v3.Drive> => {
  try {
    let auth: OAuth2Client;
    
    // First try using direct credentials from env
    if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
      console.log('Using credentials from GOOGLE_SHEETS_CREDENTIALS');
      const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
      
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Invalid Google Sheets credentials in GOOGLE_SHEETS_CREDENTIALS');
      }
      
      auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
      });
    }
    // Then try using credentials file
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('Using credentials file from GOOGLE_APPLICATION_CREDENTIALS');
      const authClient = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
      });
      auth = await authClient.getClient() as OAuth2Client;
    }
    else {
      throw new Error('Neither GOOGLE_SHEETS_CREDENTIALS nor GOOGLE_APPLICATION_CREDENTIALS environment variable is set');
    }
    
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Error creating Google Drive instance:', error);
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
    const drive = await getDriveInstance();
    
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