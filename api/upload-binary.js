import { google } from 'googleapis';
import { Readable } from 'stream';
import getRawBody from 'raw-body';

// Disable the built-in bodyParser
export const config = {
  api: {
    bodyParser: false,
  },
};

// Vercel has a 4.5MB payload size limit for serverless functions
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

// Helper function to initialize Google Drive client
const initializeGoogleDrive = async () => {
  try {
    console.log('[serverless] Initializing Google Drive API client...');
    
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
      console.error('[serverless] Missing one or more required environment variables: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID');
      throw new Error('Missing required Google Drive credentials');
    }
    
    // Format private key (replace escaped newlines with actual newlines)
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    // Initialize auth client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    
    // Initialize Drive client
    const drive = google.drive({ version: 'v3', auth });
    
    return { drive, folderId: process.env.GOOGLE_DRIVE_FOLDER_ID };
  } catch (error) {
    console.error('[serverless] Google Drive initialization error:', error);
    throw error;
  }
};

// Gets the raw request body as a Buffer
const getRawRequestBody = async (req) => {
  try {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    
    if (contentLength === 0) {
      throw new Error('No content received');
    }
    
    if (contentLength > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }
    
    const buffer = await getRawBody(req, {
      length: contentLength,
      limit: MAX_FILE_SIZE + 1024, // Add a little buffer for overhead
    });
    
    return buffer;
  } catch (error) {
    console.error('[serverless] Error reading request body:', error);
    throw error;
  }
};

export default async function handler(req, res) {
  console.log('[serverless] Binary upload endpoint called:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-File-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Check required headers
  const fileName = req.headers['x-file-name'];
  const fileType = req.headers['x-file-type'];
  
  if (!fileName) {
    return res.status(400).json({ success: false, message: 'Missing X-File-Name header' });
  }

  // Initialize Google Drive client
  let googleDriveClient;
  try {
    googleDriveClient = await initializeGoogleDrive();
  } catch (driveError) {
    console.error('[serverless] Failed to initialize Google Drive:', driveError);
    return res.status(500).json({ 
      success: false, 
      message: 'Error initializing Google Drive client',
      error: driveError.message
    });
  }
  
  try {
    // Get the raw binary data
    console.log('[serverless] Reading request body...');
    const fileBuffer = await getRawRequestBody(req);
    console.log(`[serverless] Received ${fileBuffer.length} bytes`);
    
    // Create a readable stream from the buffer
    const fileStream = new Readable();
    fileStream._read = () => {}; // Required but noop
    fileStream.push(fileBuffer);
    fileStream.push(null); // End of stream
    
    // Set file metadata for upload
    const fileMetadata = {
      name: fileName,
      parents: [googleDriveClient.folderId],
    };
    
    console.log(`[serverless] Uploading "${fileName}" to Google Drive folder: ${googleDriveClient.folderId}`);
    
    // Upload file to Google Drive
    const uploadResponse = await googleDriveClient.drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: fileType || 'application/octet-stream',
        body: fileStream,
      },
      fields: 'id,name,webViewLink,webContentLink',
    });
    
    if (!uploadResponse.data || !uploadResponse.data.id) {
      throw new Error('Upload response missing file ID');
    }
    
    console.log('[serverless] File uploaded to Google Drive, ID:', uploadResponse.data.id);
    
    // Make the file publicly readable
    try {
      await googleDriveClient.drive.permissions.create({
        fileId: uploadResponse.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
      console.log('[serverless] File permissions set to public');
    } catch (permissionsError) {
      console.error('[serverless] Error setting file permissions:', permissionsError);
      // Continue anyway, since the file was uploaded
    }
    
    // Get direct link URL
    const fileLink = uploadResponse.data.webContentLink || uploadResponse.data.webViewLink;
    
    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      fileId: uploadResponse.data.id,
      fileName: uploadResponse.data.name,
      fileUrl: fileLink
    });
    
  } catch (error) {
    console.error('[serverless] Upload error:', error);
    return res.status(500).json({
      success: false,
      message: `Upload failed: ${error.message}`
    });
  }
} 