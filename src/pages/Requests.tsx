import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  FormLabel,
  Paper,
  styled,
  Alert,
  Grid,
  Container
} from '@mui/material';
import { useWalletContext } from '../contexts/WalletContext';
import axios from 'axios';
import ImageCarousel from '../components/ImageCarousel';
import SubmissionAnimation from '../components/SubmissionAnimation';

// Helper function to upload file to Google Drive
const uploadFileToDrive = async (file: File) => {
  try {
    const timestamp = Date.now();
    const fileNameParts = file.name.split('.');
    const fileExt = fileNameParts.pop();
    const fileName = `${fileNameParts.join('.')}_${timestamp}.${fileExt}`;
    
    console.log('Uploading file to Google Drive:', fileName, 'size:', Math.round(file.size / 1024) + 'KB', 'type:', file.type);
    
    const VERCEL_SIZE_LIMIT = 4.5 * 1024 * 1024; // 4.5MB Vercel limit
    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB max file size
    
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // For files larger than Vercel's limit, use direct upload
    if (file.size > VERCEL_SIZE_LIMIT) {
      console.log('File size exceeds Vercel limit, using direct upload method');
      const uploadUrl = process.env.NODE_ENV === 'production'
        ? 'https://solanapoet.vercel.app/api/drive/direct-upload'
        : '/api/drive/direct-upload';

      // First, get the signed URL and upload parameters
      const signedUrlResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName,
          fileType: file.type,
          fileSize: file.size
        })
      });

      if (!signedUrlResponse.ok) {
        throw new Error('Failed to get signed upload URL');
      }

      const { uploadUrl: directUploadUrl, fileId } = await signedUrlResponse.json();

      // Upload the file directly to Google Drive
      const uploadResponse = await fetch(directUploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Direct upload to Google Drive failed');
      }

      // Get the file URL
      const fileDataResponse = await fetch(`${uploadUrl}/${fileId}`, {
        method: 'GET'
      });

      if (!fileDataResponse.ok) {
        throw new Error('Failed to get file URL after upload');
      }

      const { fileUrl } = await fileDataResponse.json();
      return fileUrl;
    }
    
    // For files under Vercel's limit, use the existing method
    const formData = new FormData();
    formData.append('file', file);
    console.log('FormData contents:', [...formData.entries()]);
    
    const uploadUrl = process.env.NODE_ENV === 'production'
      ? 'https://solanapoet.vercel.app/api/drive/upload'
      : '/api/drive/upload';
    
    console.log('Sending request to:', uploadUrl);
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Server response error:', response.status, errorData);
      const message = response.status === 413
        ? 'File too large for server (max 4.5MB including overhead)'
        : errorData.message || 'Unknown error';
      throw new Error(`Upload failed with status ${response.status}: ${message}`);
    }
    
    const data = await response.json();
    console.log('Upload response data:', data);
    
    if (!data.success) {
      throw new Error(data.message || 'Upload failed');
    }
    
    const fileUrl = data.fileUrl;
    if (!fileUrl) {
      throw new Error('No file URL returned from server');
    }
    
    console.log('File successfully uploaded, URL:', fileUrl);
    return fileUrl;
  } catch (error: any) {
    console.error('Error in uploadFileToDrive:', error);
    throw error;
  }
};

const FormContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  maxWidth: '800px',
  margin: '0 auto',
  backgroundColor: 'rgba(255, 250, 240, 0.9)',
  border: '1px solid #8b4513',
}));

const FormField = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(3),
}));

const UploadButton = styled(Button)(({ theme }) => ({
  marginTop: theme.spacing(1),
})) as typeof Button;

const Requests: React.FC = () => {
  const { connected, publicKey } = useWalletContext();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [xHandle, setXHandle] = useState('');
  const [comment, setComment] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showAnimation, setShowAnimation] = useState(false);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!connected || !publicKey || !imageFile) {
      setSubmitStatus('error');
      alert('Please connect your wallet and select an image before submitting.');
      return;
    }

    if (imageFile.size === 0) {
      setSubmitStatus('error');
      alert('The selected file appears to be empty.');
      return;
    }

    if (!imageFile.type.startsWith('image/')) {
      setSubmitStatus('error');
      alert('Please select an image file (JPEG, PNG, etc.).');
      return;
    }

    setShowAnimation(true);

    try {
      console.log('Starting file upload process...');
      
      let imageUrl;
      try {
        imageUrl = await uploadFileToDrive(imageFile);
        console.log('Image uploaded successfully, URL:', imageUrl);
      } catch (uploadError: any) {
        setShowAnimation(false);
        setSubmitStatus('error');
        alert(`Upload error: ${uploadError.message}`);
        return;
      }

      if (!imageUrl) {
        setShowAnimation(false);
        setSubmitStatus('error');
        alert('Failed to get image URL after upload.');
        return;
      }

      const formData = {
        timestamp: new Date().toISOString(),
        requester_id: publicKey.toString(),
        image_url: imageUrl,
        x_handle: xHandle,
        comment: comment
      };

      console.log('Submitting art request to Google Sheets:', formData);
      
      const sheetsUrl = process.env.NODE_ENV === 'production'
        ? 'https://solanapoet.vercel.app/api/sheets/append'
        : '/api/sheets/append';
      console.log('Sending Sheets request to:', sheetsUrl);

      const sheetsPayload = {
        spreadsheetId: '1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0',
        range: 'art_requests!A:E',
        valueInputOption: 'RAW',
        values: [[
          formData.timestamp,
          formData.requester_id,
          formData.image_url,
          formData.x_handle,
          formData.comment
        ]]
      };
      console.log('Sheets payload:', sheetsPayload); // Added for debug

      const sheetsResponse = await axios.post(sheetsUrl, sheetsPayload);
      
      console.log('Google Sheets submission response:', sheetsResponse.data);
      
      setImageFile(null);
      setXHandle('');
      setComment('');
      setSubmitStatus('success');
    } catch (error: any) {
      console.error('Error submitting form:', error);
      setShowAnimation(false);
      setSubmitStatus('error');
      
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      alert(`Error submitting request: ${errorMessage}. Please try again later.`);
    }
  };

  const handleAnimationComplete = () => {
    setShowAnimation(false);
    setSubmitStatus('success');
  };

  if (!connected) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="h5">
          Please connect your Solana wallet to submit an art request.
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <FormContainer>
              <Typography variant="h4" sx={{ mb: 4, textAlign: 'center' }}>
                PFP Request
              </Typography>
              
              <Typography variant="body1" sx={{ mb: 4, textAlign: 'center' }}>
                Enter for a chance to win a black & white 1/1 typewriter NFT of your PFP. The artwork will also be DRiPed in color.
              </Typography>

              {submitStatus === 'success' && !showAnimation && (
                <Alert severity="success" sx={{ mb: 3 }}>
                  Your request has been submitted successfully!
                </Alert>
              )}

              {submitStatus === 'error' && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  There was an error submitting your request. Please try again.
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <FormField>
                  <FormControl fullWidth>
                    <FormLabel>Image Upload</FormLabel>
                    <input
                      accept="image/*"
                      style={{ display: 'none' }}
                      id="image-upload"
                      type="file"
                      onChange={handleImageUpload}
                    />
                    <label htmlFor="image-upload">
                      <UploadButton variant="contained" component="span">
                        Upload Image
                      </UploadButton>
                    </label>
                    {imageFile && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        Selected file: {imageFile.name}
                      </Typography>
                    )}
                  </FormControl>
                </FormField>

                <FormField>
                  <TextField
                    fullWidth
                    label="X (Twitter) Handle"
                    value={xHandle}
                    onChange={(e) => setXHandle(e.target.value)}
                    placeholder="@username (optional)"
                  />
                </FormField>

                <FormField>
                  <TextField
                    fullWidth
                    label="Comments"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    multiline
                    rows={4}
                    placeholder="Any additional comments or requests (optional)"
                  />
                </FormField>

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  size="large"
                  sx={{ mt: 2 }}
                >
                  Submit Request
                </Button>
              </form>
            </FormContainer>
          </Grid>

          <Grid item xs={12} md={6}>
            <ImageCarousel />
          </Grid>
        </Grid>
      </Container>

      <SubmissionAnimation 
        show={showAnimation} 
        onComplete={handleAnimationComplete} 
      />
    </>
  );
};

export default Requests;