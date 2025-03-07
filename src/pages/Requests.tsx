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
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await axios.post('/api/drive/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  if (!response.data.success) {
    throw new Error('Failed to upload file');
  }

  return response.data.fileUrl;
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
      return;
    }

    // Show animation immediately
    setShowAnimation(true);

    try {
      // Upload image to Google Drive
      const imageUrl = await uploadFileToDrive(imageFile);

      // Submit to Google Sheets through server endpoint
      const formData = {
        timestamp: new Date().toISOString(),
        requester_id: publicKey.toString(),
        image_url: imageUrl,
        x_handle: xHandle,
        comment: comment
      };

      await axios.post(`/api/sheets/values/1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0/${encodeURIComponent('art_requests!A:E')}/append`, {
        valueInputOption: 'RAW',
        values: [[
          formData.timestamp,
          formData.requester_id,
          formData.image_url,
          formData.x_handle,
          formData.comment
        ]]
      });
      
      // Reset form
      setImageFile(null);
      setXHandle('');
      setComment('');
      setSubmitStatus('success');
    } catch (error) {
      console.error('Error submitting form:', error);
      setShowAnimation(false);
      setSubmitStatus('error');
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