import json
import requests
import time
from datetime import datetime

def find_all_ultimate_nfts():
    page = 1
    ultimate_nfts = []
    total_checked = 0
    
    while True:
        print(f"Checking page {page}...")
        
        response = requests.post(
            "https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d",
            json={
                "jsonrpc": "2.0",
                "id": "my-id",
                "method": "getAssetsByGroup",
                "params": {
                    "groupKey": "collection",
                    "groupValue": "DGPTxgKaBPJv3Ng7dc9AFDpX6E7kgUMZEgyTm3VGWPW6",
                    "page": page,
                    "limit": 10000
                }
            }
        )
        
        try:
            data = response.json()
            items = data["result"]["items"]
            total_checked += len(items)
            
            # Look for NFTs with ultimate rarity
            for nft in items:
                content = nft.get("content", {})
                metadata = content.get("metadata", {})
                attributes = metadata.get("attributes", [])
                
                for attr in attributes:
                    if (attr.get("trait_type") == "rarity" and 
                        isinstance(attr.get("value"), str) and 
                        attr["value"].lower() == "ultimate"):
                        ultimate_nfts.append({
                            "id": nft["id"],
                            "name": metadata.get("name"),
                            "rarity": attr["value"],
                            "image": content.get("files", [{}])[0].get("uri", ""),
                            "attributes": attributes
                        })
                        print(f"\nFound ultimate NFT: {metadata.get('name')} ({nft['id']})")
            
            if len(items) < 1000:
                print(f"\nReached end of collection. Checked {total_checked} NFTs total.")
                break
            
            page += 1
            # Add a small delay to avoid rate limiting
            time.sleep(0.5)
            
        except Exception as e:
            print(f"Error on page {page}: {str(e)}")
            break
    
    # Save results with timestamp
    result = {
        "last_updated": datetime.now().isoformat(),
        "total_nfts_checked": total_checked,
        "ultimate_nfts": ultimate_nfts
    }
    
    with open("ultimate_nfts.json", "w") as f:
        json.dump(result, f, indent=2)
    
    print(f"\nFound {len(ultimate_nfts)} ultimate NFTs. Results saved to ultimate_nfts.json")
    return ultimate_nfts

if __name__ == "__main__":
    find_all_ultimate_nfts() 