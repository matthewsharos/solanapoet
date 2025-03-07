import { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { Fields, Files, File, formidable } from 'formidable';
import { getGoogleAuth } from '../../../utils/googleAuth';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID environment variable is not set');
    }

    const auth = await getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    const form = formidable({ 
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true 
    });

    const [fields, files]: [Fields, Files] = await new Promise((resolve, reject) => {
      form.parse(req, (err: Error | null, fields: Fields, files: Files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    const file = files.file as File;
    if (!file || Array.isArray(file)) {
      return res.status(400).json({ error: 'No file or multiple files uploaded' });
    }

    const metadata = fields.metadata ? JSON.parse(fields.metadata.toString()) : {};
    const fileMetadata = {
      name: metadata.name || file.originalFilename || 'untitled',
      mimeType: metadata.mimeType || file.mimetype || 'application/octet-stream',
      parents: [folderId],
    };

    console.log('Uploading file to Google Drive:', {
      name: fileMetadata.name,
      mimeType: fileMetadata.mimeType,
      folderId
    });

    const media = {
      mimeType: fileMetadata.mimeType,
      body: require('fs').createReadStream(file.filepath),
    };

    const uploadedFile = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webContentLink, webViewLink',
    });

    console.log('File uploaded successfully:', {
      id: uploadedFile.data.id,
      webContentLink: uploadedFile.data.webContentLink,
      webViewLink: uploadedFile.data.webViewLink
    });

    // Clean up the temporary file
    require('fs').unlinkSync(file.filepath);

    res.status(200).json({
      id: uploadedFile.data.id,
      webContentLink: uploadedFile.data.webContentLink,
      webViewLink: uploadedFile.data.webViewLink,
    });
  } catch (error: any) {
    console.error('Error uploading to Google Drive:', error);
    res.status(500).json({ error: 'Failed to upload file to Google Drive' });
  }
} 