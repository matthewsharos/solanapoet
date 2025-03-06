import json
import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

def get_google_sheets_creds():
    creds = None
    # The file token.json stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first time.
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return creds

def add_ultimates_from_json():
    try:
        # Load the ultimate NFTs we found
        with open('ultimate_nfts.json', 'r') as f:
            ultimate_nfts = json.load(f)
        
        collection_id = 'DGPTxgKaBPJv3Ng7dc9AFDpX6E7kgUMZEgyTm3VGWPW6'
        
        # Get Google Sheets credentials
        creds = get_google_sheets_creds()
        service = build('sheets', 'v4', credentials=creds)
        
        # The ID of your spreadsheet
        SPREADSHEET_ID = os.getenv('GOOGLE_SHEETS_SPREADSHEET_ID')
        
        # Prepare the values to append
        values = []
        for nft in ultimate_nfts:
            values.append([
                collection_id,  # collection_address
                nft['id'],     # nft_address
                nft['name']    # name
            ])
        
        body = {
            'values': values
        }
        
        # Append the values to the ultimates sheet
        result = service.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range='ultimates',
            valueInputOption='RAW',
            body=body
        ).execute()
        
        print(f"Added {len(values)} NFTs to the ultimates sheet")
        
    except HttpError as err:
        print(f"An error occurred: {err}")

if __name__ == '__main__':
    add_ultimates_from_json()