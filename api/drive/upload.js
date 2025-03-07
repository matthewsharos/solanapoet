import formidable from 'formidable';
import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

const initializeGoogleAuth = async () => {
  try {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error('Missing required Google credentials');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    return auth;
  } catch (error) {
    console.error('Error initializing Google Auth:', error);
    throw error;
  }
};

// Serverless function for uploading files to Google Drive
export default async function handler(req, res) {
  console.log('[serverless] Drive upload endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Initialize Google auth
    const auth = await initializeGoogleAuth();
    console.log('Google auth initialized successfully');

    // Parse form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
      multiples: false,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Form parsing error:', err);
          reject(err);
          return;
        }
        resolve([fields, files]);
      });
    });

    const fileArray = Object.values(files);
    if (!fileArray.length) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const uploadedFile = fileArray[0];
    console.log('Processing file:', {
      name: uploadedFile.originalFilename,
      size: uploadedFile.size,
      type: uploadedFile.mimetype,
      path: uploadedFile.filepath
    });

    // Initialize Drive client
    const drive = google.drive({ version: 'v3', auth });

    // Read file into buffer
    const fileBuffer = await fs.promises.readFile(uploadedFile.filepath);

    // Create readable stream
    const fileStream = new Readable();
    fileStream._read = () => {}; // Required but noop
    fileStream.push(fileBuffer);
    fileStream.push(null);

    // Prepare metadata
    const metadata = fields.metadata ? JSON.parse(fields.metadata.toString()) : {};
    const fileMetadata = {
      name: metadata.name || uploadedFile.originalFilename || 'untitled',
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    };

    console.log('Uploading to Google Drive...', { filename: fileMetadata.name });

    // Upload to Google Drive
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: uploadedFile.mimetype || 'application/octet-stream',
        body: fileStream,
      },
      fields: 'id,name,webViewLink,webContentLink',
    });

    // Set file permissions to be publicly readable
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Clean up temporary file
    await fs.promises.unlink(uploadedFile.filepath).catch(error => {
      console.warn('Cleanup error:', error.message);
    });

    console.log('File uploaded successfully:', response.data.webViewLink);
    return res.status(200).json({
      success: true,
      file: response.data,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error uploading file',
      message: error.message
    });
  }
} 