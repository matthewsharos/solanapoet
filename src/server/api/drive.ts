import { Router } from 'express';
import multer from 'multer';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { Request, Response } from 'express';
import { drive_v3 } from 'googleapis';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Create a Google Drive instance using service account
const getDriveInstance = (): drive_v3.Drive => {
  try {
    // Parse credentials from environment variable
    const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS || '{}');
    
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Missing or invalid Google credentials in environment variables');
    }
    
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    
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
      res.status(400).json({ error: 'Invalid metadata format' });
      return;
    }

    console.log('Creating Google Drive instance...');
    const drive = getDriveInstance();
    
    // Create a readable stream from the buffer
    const fileStream = new Readable();
    fileStream.push(file.buffer);
    fileStream.push(null);

    console.log('Uploading file to Google Drive...');
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

    console.log('Getting file metadata...');
    const fileData = await drive.files.get({
      fileId: response.data.id,
      fields: 'id, webViewLink, webContentLink',
    });

    console.log('Sending response to client...');
    res.json({
      id: fileData.data.id,
      webViewLink: fileData.data.webViewLink,
      webContentLink: fileData.data.webContentLink,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file', details: error instanceof Error ? error.message : String(error) });
  }
});

export default router; 