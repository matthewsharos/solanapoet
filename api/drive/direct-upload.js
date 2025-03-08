import { google } from 'googleapis';

// Configure API to handle both JSON and raw body
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500kb', // Limit for JSON payload
    },
  },
};

// Initialize Google Drive client
const initializeGoogleDrive = async () => {
  console.log('[direct-upload] Initializing Google Drive client...');
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('Missing required Google Drive credentials');
  }

  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });
  console.log('[direct-upload] Google Drive client initialized');
  return { drive, folderId: process.env.GOOGLE_DRIVE_FOLDER_ID };
};

export default async function handler(req, res) {
  console.log('[direct-upload] Received request:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    console.log('[direct-upload] Handling OPTIONS request');
    res.status(200).end();
    return;
  }

  // Handle GET request to fetch file URL after upload
  if (req.method === 'GET') {
    console.log('[direct-upload] Handling GET request');
    const fileId = req.query.fileId;
    if (!fileId) {
      console.log('[direct-upload] Missing fileId in GET request');
      return res.status(400).json({ success: false, message: 'File ID is required' });
    }

    try {
      const driveClient = await initializeGoogleDrive();
      console.log('[direct-upload] Getting file details for:', fileId);
      
      const file = await driveClient.drive.files.get({
        fileId,
        fields: 'webViewLink',
      });

      console.log('[direct-upload] Setting public permissions for:', fileId);
      // Set public permissions
      await driveClient.drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
      });

      console.log('[direct-upload] Successfully retrieved file URL');
      return res.status(200).json({
        success: true,
        fileUrl: file.data.webViewLink,
      });
    } catch (error) {
      console.error('[direct-upload] Error getting file URL:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get file URL',
        error: error.message,
      });
    }
  }

  // Handle POST request to get signed URL
  if (req.method === 'POST') {
    console.log('[direct-upload] Handling POST request');
    try {
      const { fileName, fileType, fileSize } = req.body;
      console.log('[direct-upload] Request body:', { fileName, fileType, fileSize });

      if (!fileName || !fileType || !fileSize) {
        console.log('[direct-upload] Missing required parameters');
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters',
        });
      }

      const driveClient = await initializeGoogleDrive();

      console.log('[direct-upload] Creating file in Google Drive');
      // Create a resumable upload session
      const response = await driveClient.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [driveClient.folderId],
        },
        fields: 'id',
        supportsAllDrives: true,
      });

      const fileId = response.data.id;
      console.log('[direct-upload] Created file with ID:', fileId);

      console.log('[direct-upload] Generating upload URL');
      // Generate signed URL for upload
      const signedUrl = await driveClient.drive.files.generateUploadUrl({
        fileId,
        fields: 'id',
      });

      console.log('[direct-upload] Successfully generated upload URL');
      return res.status(200).json({
        success: true,
        uploadUrl: signedUrl.data.uploadUrl,
        fileId,
      });
    } catch (error) {
      console.error('[direct-upload] Error creating upload session:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create upload session',
        error: error.message,
      });
    }
  }

  console.log('[direct-upload] Method not allowed:', req.method);
  return res.status(405).json({ 
    success: false, 
    message: `Method ${req.method} not allowed` 
  });
} 