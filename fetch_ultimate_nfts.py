import requests
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
import time
from typing import Optional, List, Dict

# Configuration
HELIUS_API_KEY = "1aac55c4-5c9d-411a-bd46-37479a165e6d"
GOOGLE_SHEETS_SPREADSHEET_ID = "1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0"
COLLECTION_ID = "DGPTxgKaBPJv3Ng7dc9AFDpX6E7kgUMZEgyTm3VGWPW6"
CREDENTIALS_PATH = "config/credentials/hazel-logic-452717-h3-71bb2598adb7.json"

def init_google_sheets():
    """Initialize Google Sheets API client."""
    credentials = service_account.Credentials.from_service_account_file(
        CREDENTIALS_PATH,
        scopes=['https://www.googleapis.com/auth/spreadsheets']
    )
    service = build('sheets', 'v4', credentials=credentials)
    return service.spreadsheets()

def get_nfts_by_collection(collection: str, cursor: Optional[str] = None) -> tuple[List[Dict], Optional[str]]:
    """Fetch NFTs from a collection using Helius searchAssets API with cursor-based pagination."""
    url = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}"
    
    payload = {
        "jsonrpc": "2.0",
        "id": "my-id",
        "method": "searchAssets",
        "params": {
            "grouping": ["collection", collection],
            "limit": 1000,
            "sortBy": {"sortBy": "id", "sortDirection": "asc"},
            "displayOptions": {
                "showCollectionMetadata": True
            }
        }
    }
    
    # Add cursor parameter for pagination if provided
    if cursor:
        payload["params"]["cursor"] = cursor
    
    max_retries = 3
    retry_delay = 1
    
    for attempt in range(max_retries):
        try:
            response = requests.post(url, json=payload)
            if response.status_code == 200:
                data = response.json()
                if "error" in data:
                    print(f"API Error: {data['error']}")
                    time.sleep(retry_delay * (attempt + 1))
                    continue
                    
                result = data.get("result", {})
                items = result.get("items", [])
                if not items:
                    return [], None
                
                # Get the cursor from the API response
                next_cursor = result.get("cursor")
                
                return items, next_cursor
                
            else:
                print(f"HTTP Error {response.status_code}: {response.text}")
                
        except Exception as e:
            print(f"Request attempt {attempt + 1} failed: {str(e)}")
            
        time.sleep(retry_delay * (attempt + 1))
    
    return [], None

def check_nft_rarity(nft: Dict) -> str:
    """Check NFT rarity and return the rarity level if it matches."""
    attributes = nft.get("content", {}).get("metadata", {}).get("attributes", [])
    for attr in attributes:
        if attr.get("trait_type", "").lower() == "rarity":
            return attr.get("value", "").lower()
    return "none"

def log_ultimate_nft(sheets, nft: Dict):
    """Log Ultimate NFT to Google Sheets."""
    range_name = "ultimates!A:D"
    values = [[
        nft.get("id", ""),  # NFT Address
        nft.get("content", {}).get("metadata", {}).get("name", ""),  # Name
        nft.get("ownership", {}).get("owner", ""),  # Owner
        COLLECTION_ID  # collection_id
    ]]
    
    body = {
        'values': values
    }
    
    sheets.values().append(
        spreadsheetId=GOOGLE_SHEETS_SPREADSHEET_ID,
        range=range_name,
        valueInputOption='RAW',
        insertDataOption='INSERT_ROWS',
        body=body
    ).execute()

def main():
    print("Initializing Google Sheets...")
    sheets = init_google_sheets()
    
    total_processed = 0
    ultimate_found = 0
    rare_found = 0
    legendary_found = 0
    cursor = None
    batch_number = 1
    max_retries_per_batch = 3
    
    print(f"Starting to fetch NFTs from collection: {COLLECTION_ID}")
    
    while True:
        retry_count = 0
        success = False
        
        while retry_count < max_retries_per_batch and not success:
            try:
                nfts, next_cursor = get_nfts_by_collection(COLLECTION_ID, cursor)
                
                if not nfts:
                    if batch_number == 1:
                        print("No NFTs found in collection")
                    else:
                        print("No more NFTs to process")
                    print(f"\nProcessing complete!")
                    print(f"Total batches processed: {batch_number-1:,}")
                    print(f"Total NFTs processed: {total_processed:,}")
                    print(f"Total Ultimate NFTs found: {ultimate_found:,}")
                    print(f"Total Legendary NFTs found: {legendary_found:,}")
                    print(f"Total Rare NFTs found: {rare_found:,}")
                    return
                
                success = True
                total_processed += len(nfts)
                
                # Process NFTs
                for nft in nfts:
                    rarity = check_nft_rarity(nft)
                    if rarity == "ultimate":
                        name = nft.get("content", {}).get("metadata", {}).get("name", "Unknown")
                        owner = nft.get("ownership", {}).get("owner", "Unknown")
                        print(f"Found Ultimate NFT: {name} (Owner: {owner})")
                        log_ultimate_nft(sheets, nft)
                        ultimate_found += 1
                    elif rarity == "rare":
                        rare_found += 1
                    elif rarity == "legendary":
                        legendary_found += 1
                
                print(f"Batch {batch_number} - Processing {len(nfts):,} NFTs. Total processed: {total_processed:,}")
                print(f"Found so far - Ultimates: {ultimate_found:,}, Legendaries: {legendary_found:,}, Rares: {rare_found:,}")
                print(f"Current cursor: {next_cursor}")
                
                if not next_cursor:
                    print("Reached end of collection")
                    print(f"\nProcessing complete!")
                    print(f"Total batches processed: {batch_number:,}")
                    print(f"Total NFTs processed: {total_processed:,}")
                    print(f"Total Ultimate NFTs found: {ultimate_found:,}")
                    print(f"Total Legendary NFTs found: {legendary_found:,}")
                    print(f"Total Rare NFTs found: {rare_found:,}")
                    return
                
                cursor = next_cursor
                batch_number += 1
                time.sleep(0.2)  # Rate limiting delay
                
            except Exception as e:
                print(f"Error on batch {batch_number}: {str(e)}")
                retry_count += 1
                time.sleep(1 * retry_count)
                if retry_count >= max_retries_per_batch:
                    print(f"Failed to process batch {batch_number} after {max_retries_per_batch} attempts")
                    print(f"\nProcessing complete (with errors)!")
                    print(f"Total batches processed: {batch_number-1:,}")
                    print(f"Total NFTs processed: {total_processed:,}")
                    print(f"Total Ultimate NFTs found: {ultimate_found:,}")
                    print(f"Total Legendary NFTs found: {legendary_found:,}")
                    print(f"Total Rare NFTs found: {rare_found:,}")
                    return

if __name__ == "__main__":
    main() 