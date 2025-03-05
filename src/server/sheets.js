import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load service account credentials
let credentials;
try {
  credentials = JSON.parse(
    readFileSync(join(process.cwd(), 'hazel-logic-452717-h3-71bb2598adb7.json'), 'utf8')
  );
  console.log('Successfully loaded Google Sheets credentials');
} catch (error) {
  console.error('Failed to load Google Sheets credentials:', error);
  throw new Error('Failed to initialize Google Sheets client: Could not load credentials');
}

// Create JWT client
const auth = new google.auth.JWT(
  credentials.client_email,
  undefined,
  credentials.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);

// Create Google Sheets client
const sheets = google.sheets({ version: 'v4', auth });

// Test the auth connection
auth.authorize((err) => {
  if (err) {
    console.error('Failed to authorize Google Sheets client:', err);
    throw err;
  }
  console.log('Google Sheets client authorized successfully');
});

export async function getSheetValues(spreadsheetId: string, range: string) {
  try {
    console.log('Fetching sheet values:', { spreadsheetId, range });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    console.log('Successfully fetched sheet values');
    return response.data;
  } catch (error: any) {
    console.error('Error fetching sheet data:', {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.response?.data
    });
    throw error;
  }
}

export async function appendSheetValues(
  spreadsheetId: string, 
  range: string,
  valueInputOption: string,
  values: any[][]
) {
  try {
    console.log('Appending sheet values:', { spreadsheetId, range, valueInputOption });
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values }
    });
    console.log('Successfully appended sheet values');
    return response.data;
  } catch (error: any) {
    console.error('Error appending sheet data:', {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.response?.data
    });
    throw error;
  }
}

export async function updateSheetValues(
  spreadsheetId: string,
  range: string,
  valueInputOption: string,
  values: any[][]
) {
  try {
    console.log('Updating sheet values:', { spreadsheetId, range, valueInputOption });
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values }
    });
    console.log('Successfully updated sheet values');
    return response.data;
  } catch (error: any) {
    console.error('Error updating sheet data:', {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.response?.data
    });
    throw error;
  }
}

export async function batchUpdate(
  spreadsheetId: string,
  requests: any[]
) {
  try {
    console.log('Performing batch update:', { spreadsheetId });
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });
    console.log('Successfully performed batch update');
    return response.data;
  } catch (error: any) {
    console.error('Error performing batch update:', {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.response?.data
    });
    throw error;
  }
} 