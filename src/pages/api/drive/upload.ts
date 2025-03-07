import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import { OAuth2Client } from 'google-auth-library';

export const config = {
  api: {
    bodyParser: false,
  },
};

const initializeGoogleAuth = async () => {
  try {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Missing Google API credentials');
    }

    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error('Missing Google Drive folder ID');
    }

    // Process private key to handle escaped newlines
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    return auth;
  } catch (error) {
    console.error('Error initializing Google Auth:', error);
    throw error;
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('Starting file upload process...');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Google auth
    console.log('Initializing Google Auth...');
    const auth = await initializeGoogleAuth();
    console.log('Google Auth initialized successfully');

    // Parse form data
    console.log('Parsing form data...');
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
      multiples: false,
    });

    const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Error parsing form:', err);
          reject(err);
          return;
        }
        resolve([fields, files]);
      });
    });

    console.log('Form data parsed successfully');

    // Get the uploaded file
    const fileArray = Object.values(files);
    if (!fileArray.length) {
      console.error('No file found in request');
      return res.status(400).json({ error: 'No file provided' });
    }

    const uploadedFile = fileArray[0] as unknown as formidable.File;
    console.log('File details:', {
      name: uploadedFile.originalFilename,
      size: uploadedFile.size,
      type: uploadedFile.mimetype
    });

    // Initialize Drive client
    console.log('Initializing Drive client...');
    const authClient = await auth.getClient() as OAuth2Client;
    const drive = google.drive({ version: 'v3', auth: authClient });
    console.log('Drive client initialized');

    // Prepare file metadata
    const metadata = fields.metadata ? JSON.parse(fields.metadata.toString()) : {};
    const fileMetadata = {
      name: metadata.name || uploadedFile.originalFilename || 'untitled',
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID as string],
    };

    console.log('File metadata:', fileMetadata);

    // Create readable stream from file
    const fileBuffer = await fs.promises.readFile(uploadedFile.filepath);
    const fileStream = new Readable();
    fileStream.push(fileBuffer);
    fileStream.push(null);

    const media = {
      mimeType: uploadedFile.mimetype || 'application/octet-stream',
      body: fileStream,
    };

    // Upload file to Google Drive
    console.log('Uploading file to Google Drive...');
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink,webContentLink',
    });

    console.log('File uploaded successfully');

    // Set file permissions
    console.log('Setting file permissions...');
    await drive.permissions.create({
      fileId: response.data.id as string,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    console.log('File permissions set successfully');

    // Clean up temporary file
    try {
      await fs.promises.unlink(uploadedFile.filepath);
    } catch (cleanupError) {
      console.warn('Error cleaning up temporary file:', cleanupError instanceof Error ? cleanupError.message : 'Unknown error');
    }

    return res.status(200).json({
      success: true,
      file: response.data,
    });
  } catch (error) {
    console.error('Error in upload handler:', error instanceof Error ? error.message : 'Unknown error');
    
    // Detailed error response
    const errorResponse = {
      error: 'Error uploading file',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
    };

    return res.status(500).json(errorResponse);
  }
} 