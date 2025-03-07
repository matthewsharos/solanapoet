// Re-export API types
export * from '../types/api';

// Re-export API client
export * from './client';

// Export any additional types or functions needed by components
export interface Collection {
  address: string;
  name: string;
  image?: string;
  description?: string;
  addedAt?: number;
  creationDate?: string;
  ultimates?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface CollectionApiResponse extends ApiResponse<never> {
  collections: Collection[];
  length: number;
  sample?: Collection;
}

export interface DisplayNameMapping {
  walletAddress: string;
  displayName: string;
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'; 