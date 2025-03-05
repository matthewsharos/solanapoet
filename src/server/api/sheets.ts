import { Router, Request, Response } from 'express';
import { getSheetValues, appendSheetValues, updateSheetValues, batchUpdate } from '../sheets';

interface SheetError {
  message: string;
  stack?: string;
  code?: number;
  status?: number;
  details?: any;
  response?: {
    data: any;
  };
}

const router = Router();

// Get values from a sheet
router.get('/values/:spreadsheetId/:range', async (req: Request, res: Response) => {
  try {
    const { spreadsheetId, range } = req.params;
    const decodedRange = decodeURIComponent(range);
    console.log('Fetching sheet values:', { spreadsheetId, range: decodedRange });
    
    if (!spreadsheetId || !range) {
      console.error('Missing required parameters');
      return res.status(400).json({
        error: 'Missing required parameters',
        details: { spreadsheetId, range }
      });
    }

    const sheetData = await getSheetValues(spreadsheetId, decodedRange);
    console.log('Sheet data retrieved:', sheetData);
    
    if (!sheetData) {
      console.error('No data returned from Google Sheets');
      return res.status(404).json({
        error: 'No data found',
        details: { spreadsheetId, range }
      });
    }
    
    // Wrap the response in a data property to match frontend expectations
    return res.json({ data: sheetData });
  } catch (error) {
    const err = error as SheetError;
    console.error('Detailed error in GET /values:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      status: err.status,
      details: err.details || err.response?.data
    });
    
    // Send appropriate error response
    const status = err.code === 404 ? 404 : err.code === 403 ? 403 : 500;
    return res.status(status).json({
      error: err.message,
      details: err.details || err.response?.data,
      code: err.code
    });
  }
});

// Append values to a sheet
router.post('/values/:spreadsheetId/:range/append', async (req: Request, res: Response) => {
  try {
    const { spreadsheetId, range } = req.params;
    const { valueInputOption, values } = req.body;
    const decodedRange = decodeURIComponent(range);
    console.log('Appending sheet values:', { spreadsheetId, range: decodedRange, valueInputOption });
    
    const data = await appendSheetValues(
      spreadsheetId,
      decodedRange,
      valueInputOption,
      values
    );
    console.log('Sheet data appended:', data);
    
    res.json(data);
  } catch (error) {
    const err = error as SheetError;
    console.error('Detailed error in POST /values/append:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      status: err.status,
      details: err.details || err.response?.data
    });
    
    const status = err.code === 404 ? 404 : err.code === 403 ? 403 : 500;
    res.status(status).json({
      error: err.message,
      details: err.details || err.response?.data,
      code: err.code
    });
  }
});

// Update values in a sheet
router.put('/values/:spreadsheetId/:range', async (req: Request, res: Response) => {
  try {
    const { spreadsheetId, range } = req.params;
    const { valueInputOption, values } = req.body;
    const decodedRange = decodeURIComponent(range);
    console.log('Updating sheet values:', { spreadsheetId, range: decodedRange, valueInputOption });
    
    const data = await updateSheetValues(
      spreadsheetId,
      decodedRange,
      valueInputOption,
      values
    );
    console.log('Sheet data updated:', data);
    
    res.json(data);
  } catch (error) {
    const err = error as SheetError;
    console.error('Detailed error in PUT /values:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      status: err.status,
      details: err.details || err.response?.data
    });
    
    const status = err.code === 404 ? 404 : err.code === 403 ? 403 : 500;
    res.status(status).json({
      error: err.message,
      details: err.details || err.response?.data,
      code: err.code
    });
  }
});

// Batch update
router.post('/batch/:spreadsheetId', async (req: Request, res: Response) => {
  try {
    const { spreadsheetId } = req.params;
    console.log('Batch updating sheet:', { spreadsheetId });
    
    const data = await batchUpdate(spreadsheetId, req.body);
    console.log('Sheet batch updated:', data);
    
    res.json(data);
  } catch (error) {
    const err = error as SheetError;
    console.error('Detailed error in POST /batch:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      status: err.status,
      details: err.details || err.response?.data
    });
    
    const status = err.code === 404 ? 404 : err.code === 403 ? 403 : 500;
    res.status(status).json({
      error: err.message,
      details: err.details || err.response?.data,
      code: err.code
    });
  }
});

export default router; 