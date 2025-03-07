import { NextApiRequest, NextApiResponse } from 'next';
import formidable, { Fields, Files, File } from 'formidable';
import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import { OAuth2Client } from 'google-auth-library';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Google auth with drive.file scope
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    // Use memory storage for Vercel's read-only filesystem
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
      uploadDir: '/tmp', // This will be ignored since we're using memory storage
      filename: (_name, _ext, part) => part.originalFilename || 'untitled',
    });

    const { fields, files } = await new Promise<{ fields: Fields; files: Files }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    // Check if we have any files - look for 'file' field
    const uploadedFile = files['file'] as File | undefined;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const authClient = await auth.getClient() as OAuth2Client;
    const drive = google.drive({ version: 'v3', auth: authClient });

    const metadata = fields.metadata ? JSON.parse(fields.metadata.toString()) : {};
    const fileMetadata = {
      name: metadata.name || uploadedFile.originalFilename || 'untitled',
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID as string],
    };

    // Create a readable stream from the file buffer
    const fileBuffer = await fs.promises.readFile(uploadedFile.filepath);
    const fileStream = new Readable();
    fileStream.push(fileBuffer);
    fileStream.push(null);

    const media = {
      mimeType: uploadedFile.mimetype || 'application/octet-stream',
      body: fileStream,
    };

    console.log('Uploading file to Google Drive:', {
      name: fileMetadata.name,
      mimeType: media.mimeType,
      size: fileBuffer.length,
    });

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink,webContentLink',
    });

    // Set file permissions to anyone with the link can view
    await drive.permissions.create({
      fileId: response.data.id as string,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    console.log('File uploaded successfully:', {
      id: response.data.id,
      name: response.data.name,
      webViewLink: response.data.webViewLink,
      webContentLink: response.data.webContentLink,
    });

    return res.status(200).json({
      success: true,
      file: response.data,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ 
      error: 'Error uploading file',
      details: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }
} 