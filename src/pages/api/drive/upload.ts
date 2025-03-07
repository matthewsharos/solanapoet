import { NextApiRequest, NextApiResponse } from 'next';
import formidable, { Fields, Files, File } from 'formidable';
import { google } from 'googleapis';
import { getGoogleAuth } from '../../../utils/googleAuth';
import fs from 'fs';

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
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
    });

    const { fields, files } = await new Promise<{ fields: Fields; files: Files }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    // Check if we have any files
    const uploadedFiles = files['uploadedFile'] as File[] | undefined;
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = uploadedFiles[0];
    const auth = await getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    const metadata = fields.metadata ? JSON.parse(fields.metadata.toString()) : {};
    const fileMetadata = {
      name: metadata.name || file.originalFilename || 'untitled',
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID as string],
    };

    const media = {
      mimeType: file.mimetype || 'application/octet-stream',
      body: fs.createReadStream(file.filepath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink',
    });

    // Clean up the temporary file
    fs.unlinkSync(file.filepath);

    return res.status(200).json({
      success: true,
      file: response.data,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({ error: 'Error uploading file' });
  }
} 