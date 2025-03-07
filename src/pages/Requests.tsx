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
    console.log('Uploading file to Google Drive:', file.name);
    
    // Check file size client-side (4MB limit for Vercel)
    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }
    
    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    
    // Send the request with timeout and proper error handling
    const response = await axios.post('/api/drive/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000, // 30 seconds timeout
    });

    console.log('Google Drive upload response:', response.data);
    
    if (!response.data.success) {
      console.error('Upload failed:', response.data.message || 'Unknown error');
      throw new Error(response.data.message || 'Failed to upload file');
    }

    if (!response.data.fileUrl) {
      throw new Error('No file URL returned from server');
    }

    return response.data.fileUrl;
  } catch (error: any) {
    console.error('Error in uploadFileToDrive:', error);
    
    // More descriptive error messages
    if (error.response) {
      // Server responded with an error status code
      const serverError = error.response.data?.message || 'Server error';
      throw new Error(`Upload failed: ${serverError}`);
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Upload timed out or server did not respond');
    } else {
      // Something else happened while setting up the request
      throw error;
    }
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

    // Validate image file
    if (imageFile.size === 0) {
      setSubmitStatus('error');
      alert('The selected file appears to be empty.');
      return;
    }

    // Check file type (allow only images)
    if (!imageFile.type.startsWith('image/')) {
      setSubmitStatus('error');
      alert('Please select an image file (JPEG, PNG, etc.).');
      return;
    }

    // Show animation immediately
    setShowAnimation(true);

    try {
      console.log('Starting file upload process...');
      
      // Upload image to Google Drive with error handling
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

      // Only continue if we have an image URL
      if (!imageUrl) {
        setShowAnimation(false);
        setSubmitStatus('error');
        alert('Failed to get image URL after upload.');
        return;
      }

      // Submit to Google Sheets through server endpoint
      const formData = {
        timestamp: new Date().toISOString(),
        requester_id: publicKey.toString(),
        image_url: imageUrl,
        x_handle: xHandle,
        comment: comment
      };

      console.log('Submitting art request to Google Sheets:', formData);
      
      // Use the sheets.js API endpoint directly
      const sheetsResponse = await axios.post('/api/sheets', {
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
      });
      
      console.log('Google Sheets submission response:', sheetsResponse.data);
      
      // Reset form
      setImageFile(null);
      setXHandle('');
      setComment('');
      setSubmitStatus('success');
    } catch (error: any) {
      console.error('Error submitting form:', error);
      setShowAnimation(false);
      setSubmitStatus('error');
      
      // Display more specific error information
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
          {/* Request Form */}
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

          {/* Example Gallery */}
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