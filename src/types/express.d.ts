import { UploadedFile } from 'express-fileupload';
import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      files?: {
        [key: string]: UploadedFile;
      } | null;
    }
  }
}

export {}; 