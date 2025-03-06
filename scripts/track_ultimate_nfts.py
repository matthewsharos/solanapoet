#!/usr/bin/env python3
import os
import json
import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from dotenv import load_dotenv
import time
from datetime import datetime
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle
import logging
import sys

# Load environment variables
load_dotenv()

# Constants
COLLECTION_ADDRESS = "DGPTxgKaBPJv3Ng7dc9AFDpX6E7kgUMZEgyTm3VGWPW6"
HELIUS_API_KEY = "1aac55c4-5c9d-411a-bd46-37479a165e6d"
HELIUS_API_URL = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}"

# Google Sheets configuration
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SPREADSHEET_ID = os.getenv('GOOGLE_SHEETS_SPREADSHEET_ID')
RANGE_NAME = 'ultimates!A2:C'  # Starting from A2 to leave room for headers

# Checkpoint file
CHECKPOINT_FILE = 'checkpoint.json'

def get_google_sheets_service():
    creds = None
    # Setup Google Sheets credentials
    if os.getenv('GOOGLE_CLIENT_EMAIL') and os.getenv('GOOGLE_PRIVATE_KEY'):
        private_key = os.getenv('GOOGLE_PRIVATE_KEY')
        # Handle escaped newlines
        if '\\n' in private_key and '\n' not in private_key:
            private_key = private_key.replace('\\n', '\n')
        
        creds_dict = {
            'client_email': os.getenv('GOOGLE_CLIENT_EMAIL'),
            'private_key': private_key
        }
        creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    elif os.path.exists('credentials.json'):
        creds = Credentials.from_service_account_file('credentials.json', scopes=SCOPES)
    else:
        logging.error('No credentials found. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY or provide credentials.json')
        sys.exit(1)
    return build('sheets', 'v4', credentials=creds)

def save_checkpoint(page, last_date):
    """Save the current progress to a checkpoint file."""
    checkpoint = {
        'page': page,
        'last_date': last_date,
        'timestamp': datetime.now().isoformat()
    }
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(checkpoint, f)
    print(f"\nCheckpoint saved: Page {page}, Last date {last_date}")

def load_checkpoint():
    """Load the last checkpoint if it exists."""
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            checkpoint = json.load(f)
        print(f"\nLoading checkpoint: Page {checkpoint['page']}, Last date {checkpoint['last_date']}")
        return checkpoint['page'], checkpoint['last_date']
    return 1, None

def add_ultimate_nft_to_sheet(nft_data):
    """Add a single ultimate NFT to the Google Sheet."""
    try:
        service = get_google_sheets_service()
        if not service:
            print("Failed to get Google Sheets service")
            return
            
        # Get existing values
        result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=RANGE_NAME
        ).execute()
        existing_values = result.get('values', [])
        
        # Check if NFT already exists
        nft_address = nft_data['address']
        for row in existing_values:
            if row and row[0] == nft_address:
                print(f"NFT {nft_address} already in sheet, skipping...")
                return
        
        # Append new NFT
        new_row = [[nft_data['address'], nft_data['name'], nft_data['owner']]]
        service.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range=RANGE_NAME,
            valueInputOption='RAW',
            insertDataOption='INSERT_ROWS',
            body={'values': new_row}
        ).execute()
        
        print(f"Added ultimate NFT to sheet: {nft_data['name']}")
    except Exception as e:
        print(f"Error adding NFT to sheet: {e}")

def fetch_nfts_from_collection():
    """Fetch all NFTs from the specified collection using Helius API."""
    all_nfts = []
    page, last_date = load_checkpoint()
    batch_size = 1000  # Maximum allowed by Helius API
    has_more = True
    
    while has_more:
        print(f"\nFetching page {page}...")
        
        payload = {
            "jsonrpc": "2.0",
            "id": "my-id",
            "method": "getAssetsByGroup",
            "params": {
                "groupKey": "collection",
                "groupValue": COLLECTION_ADDRESS,
                "page": page,
                "limit": batch_size,
                "sortBy": {
                    "sortBy": "id",  # Sort by ID since created is not supported
                    "sortDirection": "desc"
                },
                "displayOptions": {
                    "showUnverifiedCollections": True,
                    "showCollectionMetadata": True,
                    "showFungible": False,
                }
            }
        }
        
        retries = 3
        while retries > 0:
            try:
                response = requests.post(HELIUS_API_URL, json=payload)
                response.raise_for_status()
                data = response.json()
                
                if 'error' in data:
                    print(f"\nAPI Error: {data['error']}")
                    if 'Paginating beyond 500000 items' in data['error'].get('message', ''):
                        print("\nReached pagination limit. Saving progress...")
                        return all_nfts
                    return all_nfts
                    
                if 'result' not in data or 'items' not in data['result']:
                    print(f"Error fetching page {page}")
                    print(f"Response: {json.dumps(data, indent=2)}")
                    return all_nfts
                    
                batch_nfts = data['result']['items']
                if not batch_nfts:  # No more NFTs to fetch
                    has_more = False
                    break
                
                # Process each NFT
                for nft in batch_nfts:
                    attributes = nft.get('content', {}).get('metadata', {}).get('attributes', [])
                    created_date = None
                    is_ultimate = False
                    
                    for attr in attributes:
                        if attr.get('trait_type') == 'created':
                            created_date = attr.get('value')
                        elif (attr.get('trait_type', '').lower() == 'rarity' and 
                              attr.get('value', '').lower() == 'ultimate'):
                            is_ultimate = True
                    
                    # Save the date for checkpoint
                    if created_date:
                        last_date = created_date
                    
                    # If it's ultimate, save it immediately
                    if is_ultimate:
                        ultimate_nft = {
                            'address': nft['id'],
                            'name': nft.get('content', {}).get('metadata', {}).get('name', ''),
                            'owner': nft.get('ownership', {}).get('owner', '')
                        }
                        print(f"\nFound ultimate NFT: {ultimate_nft['name']}")
                        add_ultimate_nft_to_sheet(ultimate_nft)
                    
                    # Add to all_nfts for final report
                    all_nfts.append(nft)
                
                # Save checkpoint after each page
                save_checkpoint(page, last_date)
                
                print(f"Successfully processed {len(batch_nfts)} NFTs")
                print(f"Total NFTs processed so far: {len(all_nfts)}")
                
                # Add a delay between requests to avoid rate limiting
                time.sleep(0.5)
                break
                
            except requests.exceptions.RequestException as e:
                print(f"Error fetching NFTs (attempt {4-retries}/3): {e}")
                retries -= 1
                if retries > 0:
                    print("Retrying in 2 seconds...")
                    time.sleep(2)
                else:
                    print("Max retries reached. Moving to next page.")
                    break
        
        page += 1
    
    return all_nfts

def main():
    print("Starting ultimate NFT tracking script...")
    print(f"Using spreadsheet ID: {SPREADSHEET_ID}")
    
    # Initialize Google Sheet if needed
    try:
        service = get_google_sheets_service()
        if not service:
            print("Failed to get Google Sheets service")
            return
            
        # Add headers if they don't exist
        headers = [['NFT Address', 'Name', 'Owner']]
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range='ultimates!A1:C1',
            valueInputOption='RAW',
            body={'values': headers}
        ).execute()
    except Exception as e:
        print(f"Error initializing sheet: {e}")
        return
    
    print("\nFetching and processing NFTs...")
    nfts = fetch_nfts_from_collection()
    print(f"\nFinished processing {len(nfts)} total NFTs")
    
    # If we hit the pagination limit, keep the checkpoint file
    if len(nfts) >= 500000:
        print("\nReached pagination limit. Checkpoint saved for next run.")
    else:
        # Clean up checkpoint file only if we're done
        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)
            print("\nCheckpoint file cleaned up")

if __name__ == "__main__":
    main() 