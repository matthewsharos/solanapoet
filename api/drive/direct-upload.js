import { google } from 'googleapis';

export const config = {
  api: {
    bodyParser: true,
  },
};

// Initialize Google Drive client
const initializeGoogleDrive = async () => {
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
  return { drive, folderId: process.env.GOOGLE_DRIVE_FOLDER_ID };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request to fetch file URL after upload
  if (req.method === 'GET') {
    const fileId = req.query.fileId;
    if (!fileId) {
      return res.status(400).json({ success: false, message: 'File ID is required' });
    }

    try {
      const driveClient = await initializeGoogleDrive();
      const file = await driveClient.drive.files.get({
        fileId,
        fields: 'webViewLink',
      });

      // Set public permissions
      await driveClient.drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
      });

      return res.status(200).json({
        success: true,
        fileUrl: file.data.webViewLink,
      });
    } catch (error) {
      console.error('Error getting file URL:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get file URL',
      });
    }
  }

  // Handle POST request to get signed URL
  if (req.method === 'POST') {
    try {
      const { fileName, fileType, fileSize } = req.body;

      if (!fileName || !fileType || !fileSize) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters',
        });
      }

      const driveClient = await initializeGoogleDrive();

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

      // Generate signed URL for upload
      const signedUrl = await driveClient.drive.files.generateUploadUrl({
        fileId,
        fields: 'id',
      });

      return res.status(200).json({
        success: true,
        uploadUrl: signedUrl.data.uploadUrl,
        fileId,
      });
    } catch (error) {
      console.error('Error creating upload session:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create upload session',
      });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
} 