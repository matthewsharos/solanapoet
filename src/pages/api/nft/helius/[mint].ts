import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

interface NFTCreator {
  address: string;
  share: number;
  verified: boolean;
}

interface NFTOwnership {
  owner?: string;
  delegate?: string | null;
  ownership_model?: string;
  frozen?: boolean;
  delegated?: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { mint } = req.query;
  if (!mint || typeof mint !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing mint address' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    // First try the getAsset method
    const assetResponse = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: 'helius-sdk',
        method: 'getAsset',
        params: {
          id: mint,
        },
      }
    );

    if (assetResponse.data?.result) {
      const assetData = assetResponse.data.result;
      const content = assetData.content || {};
      const metadata = content.metadata || {};
      const files = content.files || [];
      const links = content.links || {};
      const ownership = assetData.ownership || {};
      const grouping = assetData.grouping || [];
      const collection = grouping.find((g: any) => g.group_key === 'collection')?.group_value;
      const creators = assetData.creators || [];

      // Get the best available image URL
      const imageUrl = getImageUrl(files, links);

      // Get attributes/traits with proper formatting
      const attributes = getAttributes(metadata, content);

      // Get the owner information
      const ownerInfo = getOwnerInfo(ownership, assetData);

      // Get the description with fallbacks
      const description = getDescription(metadata, content);

      return res.status(200).json({
        success: true,
        nft: {
          mint,
          name: metadata.name || '',
          symbol: metadata.symbol || '',
          description,
          image: imageUrl,
          attributes,
          owner: ownerInfo,
          collection: collection ? {
            address: collection,
            name: metadata.collection?.name || '',
          } : null,
          creators: creators.map((creator: NFTCreator) => ({
            address: creator.address,
            share: creator.share,
            verified: creator.verified,
          })),
          json_uri: content.json_uri || '',
          royalty: assetData.royalty || null,
          tokenStandard: metadata.token_standard || null,
        },
      });
    }

    // Fallback to token metadata endpoint
    const metadataResponse = await axios.post(
      `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`,
      { mintAccounts: [mint] }
    );

    const nftData = metadataResponse.data?.[0];
    if (!nftData || nftData.onChainAccountInfo.error === 'EMPTY_ACCOUNT') {
      return res.status(404).json({ success: false, message: 'NFT not found' });
    }

    // Transform the data into our expected format
    return res.status(200).json({
      success: true,
      nft: transformNFTData(nftData),
    });

  } catch (error) {
    console.error('Error fetching NFT:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch NFT data',
    });
  }
}

function getImageUrl(files: any[], links: any): string {
  // Try CDN URL from files first
  const cdnUrl = files[0]?.cdn_uri;
  if (cdnUrl && !cdnUrl.endsWith('//')) {
    return cdnUrl;
  }

  // Try regular URL from files
  const fileUrl = files[0]?.uri;
  if (fileUrl) {
    return fileUrl;
  }

  // Try image link
  if (links.image) {
    return links.image;
  }

  return '';
}

function getAttributes(metadata: any, content: any): NFTAttribute[] {
  // Try metadata attributes first
  if (metadata.attributes && Array.isArray(metadata.attributes)) {
    return metadata.attributes.map((attr: any) => ({
      trait_type: attr.trait_type || '',
      value: attr.value || '',
    }));
  }

  // Try content attributes next
  if (content.attributes && Array.isArray(content.attributes)) {
    return content.attributes.map((attr: any) => ({
      trait_type: attr.trait_type || '',
      value: attr.value || '',
    }));
  }

  return [];
}

function getOwnerInfo(ownership: NFTOwnership, assetData: any): any {
  if (!ownership) {
    return { publicKey: '' };
  }

  return {
    publicKey: ownership.owner || '',
    delegate: ownership.delegate || null,
    ownershipModel: ownership.ownership_model || 'single',
    frozen: ownership.frozen || false,
    delegated: ownership.delegated || false,
  };
}

function getDescription(metadata: any, content: any): string {
  // Try metadata description first
  if (metadata.description) {
    return metadata.description;
  }

  // Try content description next
  if (content.description) {
    return content.description;
  }

  return '';
}

function transformNFTData(nftData: any) {
  const content = nftData.content || {};
  const metadata = content.metadata || {};
  const files = content.files || [];
  const ownership = nftData.ownership || {};
  const grouping = nftData.grouping || [];
  const collection = grouping.find((g: any) => g.group_key === 'collection')?.group_value;

  return {
    mint: nftData.id,
    name: metadata.name || '',
    symbol: metadata.symbol || '',
    description: getDescription(metadata, content),
    image: getImageUrl(files, content.links || {}),
    attributes: getAttributes(metadata, content),
    owner: getOwnerInfo(ownership, nftData),
    collection: collection ? {
      address: collection,
      name: metadata.collection?.name || '',
    } : null,
    creators: nftData.creators || [],
    json_uri: content.json_uri || '',
    royalty: nftData.royalty || null,
    tokenStandard: metadata.token_standard || null,
  };
} 