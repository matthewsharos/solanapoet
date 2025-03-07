import formidable from 'formidable';
import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Vercel has a 4.5MB payload size limit for serverless functions
// This will help log better error messages
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

// Parse form data with proper error handling for Vercel
const parseFormData = async (req) => {
  return new Promise((resolve, reject) => {
    // Configure formidable for serverless use
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      maxFields: 5,
      keepExtensions: true,
      multiples: false,
      allowEmptyFiles: false,
    });
    
    // Parse the form
    form.parse(req, (err, fields, files) => {
      if (err) {
        if (err.code === 1009) {
          console.error('[serverless] File exceeds size limit:', err.message);
          reject(new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`));
        } else {
          console.error('[serverless] Form parsing error:', err);
          reject(err);
        }
        return;
      }
      
      resolve({ fields, files });
    });
  });
};

// Serverless function for uploading files to Google Drive
export default async function handler(req, res) {
  console.log('[serverless] Drive upload endpoint called:', req.method);
  
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
    // Initialize Google Drive client
    const { drive, folderId } = await initializeGoogleDrive();
    
    // Parse the form data
    let fields, files;
    try {
      const result = await parseFormData(req);
      fields = result.fields;
      files = result.files;
    } catch (formError) {
      return res.status(400).json({ 
        success: false, 
        message: formError.message || 'Error parsing form data'
      });
    }
    
    // Verify a file was uploaded
    const fileArray = Object.values(files);
    if (!fileArray.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    // Get the file
    const uploadedFile = fileArray[0];
    if (!uploadedFile || !uploadedFile.filepath) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file data'
      });
    }
    
    // Log file details
    console.log('[serverless] Processing file:', {
      name: uploadedFile.originalFilename,
      size: uploadedFile.size,
      type: uploadedFile.mimetype
    });
    
    // Check file size (additional verification)
    if (uploadedFile.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      });
    }
    
    try {
      // Read file into buffer
      const fileBuffer = await fs.promises.readFile(uploadedFile.filepath);
      console.log(`[serverless] Successfully read ${fileBuffer.length} bytes from file`);
      
      // Create a readable stream from the buffer
      const fileStream = new Readable();
      fileStream._read = () => {}; // Required but noop
      fileStream.push(fileBuffer);
      fileStream.push(null); // End of stream
      
      // Set file metadata for upload
      const fileName = uploadedFile.originalFilename || 'untitled';
      const fileMetadata = {
        name: fileName,
        parents: [folderId],
      };
      
      // Upload file to Google Drive
      const uploadResponse = await drive.files.create({
        requestBody: fileMetadata,
        media: {
          mimeType: uploadedFile.mimetype || 'application/octet-stream',
          body: fileStream,
        },
        fields: 'id,name,webViewLink,webContentLink',
      });
      
      if (!uploadResponse.data || !uploadResponse.data.id) {
        throw new Error('Upload response missing file ID');
      }
      
      console.log('[serverless] File uploaded to Google Drive, ID:', uploadResponse.data.id);
      
      // Make the file publicly readable
      await drive.permissions.create({
        fileId: uploadResponse.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
      
      // Get direct link URL
      const fileLink = uploadResponse.data.webContentLink || uploadResponse.data.webViewLink;
      console.log('[serverless] File is now public:', fileLink);
      
      // Cleanup temporary file
      try {
        await fs.promises.unlink(uploadedFile.filepath);
      } catch (cleanupError) {
        console.warn('[serverless] Cleanup error (non-fatal):', cleanupError.message);
      }
      
      // Return success with file link
      return res.status(200).json({
        success: true,
        fileUrl: fileLink,
        file: uploadResponse.data
      });
    } catch (fileProcessingError) {
      console.error('[serverless] File processing error:', fileProcessingError);
      return res.status(500).json({
        success: false,
        message: 'Error processing file upload',
        error: fileProcessingError.message
      });
    }
  } catch (error) {
    console.error('[serverless] Google Drive upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error uploading to Google Drive',
      error: error.message
    });
  }
} 