import axios from 'axios';

// Pinata credentials from environment variables
// Use import.meta.env for Vite environment variables
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT || '';
const AUTHORIZED_MINTER = import.meta.env.VITE_AUTHORIZED_MINTER || '';
const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

// Headers for Pinata API requests
const headers = {
  'Authorization': `Bearer ${PINATA_JWT}`,
  'Content-Type': 'application/json'
};

/**
 * Upload a file to IPFS via Pinata
 * @param file The file to upload
 * @returns The IPFS hash (CID) of the uploaded file
 */
export const uploadFileToPinata = async (file: File): Promise<string> => {
  try {
    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    
    // Add metadata
    const metadata = JSON.stringify({
      name: file.name,
      keyvalues: {
        type: file.type,
        size: file.size.toString()
      }
    });
    formData.append('pinataMetadata', metadata);
    
    // Add options
    const options = JSON.stringify({
      cidVersion: 0
    });
    formData.append('pinataOptions', options);
    
    // Upload to Pinata
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    // Return the IPFS hash
    return response.data.IpfsHash;
  } catch (error) {
    console.error('Error uploading file to Pinata:', error);
    throw new Error('Failed to upload file to IPFS');
  }
};

/**
 * Upload metadata to IPFS via Pinata
 * @param metadata The metadata to upload
 * @returns The IPFS hash (CID) of the uploaded metadata
 */
export const uploadMetadataToPinata = async (metadata: any): Promise<string> => {
  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      metadata,
      { headers }
    );
    
    return response.data.IpfsHash;
  } catch (error) {
    console.error('Error uploading metadata to Pinata:', error);
    throw new Error('Failed to upload metadata to IPFS');
  }
};

/**
 * Get the IPFS gateway URL for a given hash
 * @param hash The IPFS hash (CID)
 * @returns The gateway URL
 */
export const getIPFSGatewayURL = (hash: string): string => {
  return `${IPFS_GATEWAY}${hash}`;
};

/**
 * Create and upload NFT metadata to IPFS
 * @param name NFT name
 * @param description NFT description
 * @param imageHash IPFS hash of the image
 * @param attributes NFT attributes
 * @param symbol NFT symbol
 * @returns The IPFS hash of the metadata
 */
export const createAndUploadMetadata = async (
  name: string,
  description: string,
  imageHash: string,
  attributes: Array<{ trait_type: string; value: string }>,
  symbol: string
): Promise<string> => {
  // Create metadata object according to Metaplex standard
  const metadata = {
    name,
    symbol,
    description,
    image: getIPFSGatewayURL(imageHash),
    attributes,
    properties: {
      files: [
        {
          uri: getIPFSGatewayURL(imageHash),
          type: 'image/png' // Adjust based on actual file type
        }
      ],
      category: 'image',
      creators: [
        {
          address: AUTHORIZED_MINTER, // Use environment variable
          share: 100
        }
      ]
    }
  };
  
  // Upload metadata to IPFS
  return await uploadMetadataToPinata(metadata);
}; 