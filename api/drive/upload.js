import formidable from 'formidable';
import { google } from 'googleapis';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false, // Disable Next.js bodyParser for multipart
  },
};

// Vercel payload limit is 4.5MB, set slightly below for safety
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

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

// Parse form data with detailed logging
const parseFormData = (req) =>
  new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      maxFields: 5,
      keepExtensions: true,
      multiples: false,
      allowEmptyFiles: false,
    });

    console.log('[server] Starting form parsing');
    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('[server] Form parsing error:', err);
        return reject(
          err.code === 1009
            ? new Error(`File too large. Max ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
            : new Error(`Form parsing error: ${err.message}`)
        );
      }
      console.log('[server] Parsed fields:', fields);
      console.log('[server] Parsed files:', files);
      if (!files || Object.keys(files).length === 0) {
        console.error('[server] No files found in request');
        return reject(new Error('No file uploaded'));
      }
      resolve({ fields, files });
    });
  });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  console.log('[server] Request received:', req.method);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    console.log('[server] Method not allowed:', req.method);
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  let driveClient;
  try {
    console.log('[server] Initializing Google Drive');
    driveClient = await initializeGoogleDrive();
  } catch (error) {
    console.error('[server] Google Drive initialization failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Google Drive initialization failed',
      error: error.message,
    });
  }

  try {
    const { files } = await parseFormData(req);

    const fileKey = Object.keys(files)[0];
    if (!fileKey) {
      console.error('[server] No file key found in files object');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const uploadedFile = Array.isArray(files[fileKey]) ? files[fileKey][0] : files[fileKey];
    console.log('[server] Uploaded file:', uploadedFile);

    const filePath =
      uploadedFile.filepath ||
      uploadedFile.newFileName ||
      (uploadedFile.toJSON && uploadedFile.toJSON().filepath);
    console.log('[server] Resolved filePath:', filePath);

    if (!uploadedFile || !filePath) {
      console.error('[server] Invalid file data - missing file or filepath');
      return res.status(400).json({ success: false, message: 'Invalid file data' });
    }

    const fileName = uploadedFile.originalFilename || `upload_${Date.now()}.webp`;
    const mimeType = uploadedFile.mimetype || 'image/webp';
    console.log('[server] File details:', { fileName, mimeType, size: uploadedFile.size });

    const fileStream = fs.createReadStream(filePath);
    const fileMetadata = {
      name: fileName,
      parents: [driveClient.folderId],
    };

    console.log('[server] Uploading to Google Drive:', fileName);
    const uploadResponse = await Promise.race([
      driveClient.drive.files.create({
        requestBody: fileMetadata,
        media: {
          mimeType,
          body: fileStream,
        },
        fields: 'id,webViewLink',
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Upload timed out')), 9000) // 9s to stay under 10s
      ),
    ]);

    console.log('[server] Setting public permissions');
    await driveClient.drive.permissions.create({
      fileId: uploadResponse.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    fs.unlink(filePath, (err) => {
      if (err) console.warn('[server] Cleanup failed:', err.message);
    });

    console.log('[server] Upload successful, file ID:', uploadResponse.data.id);
    return res.status(200).json({
      success: true,
      fileUrl: uploadResponse.data.webViewLink,
      fileId: uploadResponse.data.id,
    });
  } catch (error) {
    console.error('[server] Error during upload:', error);
    return res.status(error.message.includes('too large') ? 400 : 500).json({
      success: false,
      message: error.message,
    });
  }
}