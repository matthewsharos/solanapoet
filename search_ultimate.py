import json
import requests
import time

def search_ultimate_nfts():
    page = 1
    found = False
    
    while not found:
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
                    "limit": 1000
                }
            }
        )
        
        try:
            data = response.json()
            items = data["result"]["items"]
            
            # Look for NFTs with ultimate rarity
            ultimate_nfts = []
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
                            "rarity": attr["value"]
                        })
            
            if ultimate_nfts:
                print("\nFound ultimate NFTs:")
                for nft in ultimate_nfts:
                    print(f"Name: {nft['name']}")
                    print(f"ID: {nft['id']}")
                    print(f"Rarity: {nft['rarity']}\n")
                found = True
            elif len(items) < 1000:
                print("\nReached end of collection, no ultimate NFTs found.")
                break
            
            page += 1
            # Add a small delay to avoid rate limiting
            time.sleep(0.5)
            
        except Exception as e:
            print(f"Error on page {page}: {str(e)}")
            break

if __name__ == "__main__":
    search_ultimate_nfts() 