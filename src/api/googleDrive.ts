import { getOAuth2Client } from './googleAuth';

// Configuration
const FOLDER_ID = import.meta.env?.VITE_GOOGLE_DRIVE_FOLDER_ID;

// Create Google Drive client for browser environment
export const createDriveClient = async () => {
  const BASE_URL = '/api/drive'; // This will be proxied to your backend

  if (!FOLDER_ID) {
    console.error('Google Drive Folder ID is not set in environment variables');
    throw new Error('Google Drive configuration is incomplete');
  }

  return {
    files: {
      create: async ({ requestBody, media }: any) => {
        const formData = new FormData();
        formData.append('file', media.body);
        formData.append('metadata', JSON.stringify({
          name: requestBody.name,
          mimeType: requestBody.mimeType,
          parents: [FOLDER_ID]
        }));

        try {
          console.log('Attempting to upload file to Google Drive...');
          const response = await fetch(`${BASE_URL}/upload`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Upload response not OK:', {
              status: response.status,
              statusText: response.statusText,
              errorText
            });
            throw new Error(`Failed to upload file: ${response.status} ${response.statusText} - ${errorText}`);
          }

          return response.json();
        } catch (error) {
          console.error('Error in create file request:', error);
          throw error;
        }
      }
    }
  };
};

// Export drive client
export let drive: any = null;

// Initialize drive client
(async () => {
  try {
    drive = await createDriveClient();
    console.log('Google Drive client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Google Drive client:', error);
  }
})();

// Upload file to Google Drive
export const uploadFileToDrive = async (file: File): Promise<string> => {
  try {
    console.log('Starting file upload process...');
    
    if (!FOLDER_ID) {
      throw new Error('Google Drive Folder ID is not configured');
    }

    if (!drive) {
      console.log('Drive client not initialized, creating new client...');
      drive = await createDriveClient();
    }

    if (!file) {
      throw new Error('No file provided for upload');
    }

    console.log('Preparing file upload:', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    // Create form data with file and metadata
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify({
      name: file.name,
      mimeType: file.type,
      parents: [FOLDER_ID]
    }));

    // Make the upload request
    console.log('Sending upload request to server...');
    const response = await fetch('/api/drive/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload response not OK:', {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      throw new Error(`Failed to upload file: ${response.status} ${response.statusText} - ${errorText}`);
    }

    console.log('Upload response received, parsing JSON...');
    const data = await response.json();
    
    if (!data.webContentLink && !data.webViewLink) {
      console.error('Invalid response data:', data);
      throw new Error('No file URL returned from server');
    }

    console.log('File uploaded successfully:', {
      webContentLink: data.webContentLink,
      webViewLink: data.webViewLink
    });

    // Return the direct access URL for the uploaded file
    return data.webContentLink || data.webViewLink;
  } catch (error: any) {
    console.error('Error uploading file to Google Drive:', error);
    throw new Error(`Failed to upload file: ${error.message || 'Unknown error'}`);
  }
}; 