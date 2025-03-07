import formidable from 'formidable';
import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

const initializeGoogleDrive = async () => {
  try {
    console.log('[serverless] Initializing Google Drive API client...');
    
    // Check for required environment variables
    const requiredVars = ['GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_DRIVE_FOLDER_ID'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error(`[serverless] Missing required environment variables: ${missingVars.join(', ')}`);
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    console.log('[serverless] Environment variables check passed');
    
    // Initialize Google auth with properly formatted private key
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    
    console.log('[serverless] Google auth initialized successfully');
    
    // Initialize Drive client
    const drive = google.drive({ version: 'v3', auth });
    
    return { 
      drive,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID
    };
  } catch (error) {
    console.error('[serverless] Error initializing Google Drive client:', error);
    throw error;
  }
};

const parseFormData = async (req) => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
      multiples: false,
    });
    
    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('[serverless] Form parsing error:', err);
        reject(err);
        return;
      }
      
      resolve({ fields, files });
    });
  });
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
    // Initialize Google Drive
    const { drive, folderId } = await initializeGoogleDrive();
    
    // Parse form data
    const { fields, files } = await parseFormData(req);
    
    // Extract file
    const fileArray = Object.values(files);
    if (!fileArray.length) {
      console.error('[serverless] No file provided in form data');
      return res.status(400).json({ 
        success: false, 
        message: 'No file provided' 
      });
    }

    const uploadedFile = fileArray[0];
    console.log('[serverless] Processing file:', {
      name: uploadedFile.originalFilename,
      size: uploadedFile.size,
      type: uploadedFile.mimetype,
      path: uploadedFile.filepath
    });

    // Read file into buffer
    const fileBuffer = await fs.promises.readFile(uploadedFile.filepath);
    console.log(`[serverless] Read ${fileBuffer.length} bytes from file`);
    
    // Create readable stream
    const fileStream = new Readable();
    fileStream._read = () => {}; // Required but noop
    fileStream.push(fileBuffer);
    fileStream.push(null);

    // Prepare metadata
    const fileName = uploadedFile.originalFilename || 'untitled';
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    console.log(`[serverless] Uploading file "${fileName}" to Google Drive folder "${folderId}"`);

    // Upload to Google Drive
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: uploadedFile.mimetype || 'application/octet-stream',
        body: fileStream,
      },
      fields: 'id,name,webViewLink,webContentLink',
    });
    
    console.log('[serverless] File uploaded successfully, ID:', response.data.id);

    // Set file permissions to be publicly readable
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
    
    console.log('[serverless] File permissions set to public');

    // Clean up temporary file
    try {
      await fs.promises.unlink(uploadedFile.filepath);
      console.log('[serverless] Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('[serverless] Error cleaning up temporary file:', cleanupError.message);
    }

    // Return successful response with file data and URL
    return res.status(200).json({
      success: true,
      file: response.data,
      fileUrl: response.data.webContentLink || response.data.webViewLink,
    });
  } catch (error) {
    console.error('[serverless] Upload error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error uploading file to Google Drive',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 