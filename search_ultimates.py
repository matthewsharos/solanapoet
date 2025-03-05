import requests
import json
import time
import sys

def search_ultimates(collection_id):
    page = 1
    ultimate_nfts = []
    total_nfts_checked = 0
    
    while True:
        try:
            print(f'\nSearching page {page}...')
            response = requests.post(
                'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d',
                json={
                    'jsonrpc': '2.0',
                    'id': 'my-id',
                    'method': 'getAssetsByGroup',
                    'params': {
                        'groupKey': 'collection',
                        'groupValue': collection_id,
                        'page': page,
                        'limit': 1000
                    }
                }
            )
            
            response.raise_for_status()  # Raise an error for bad status codes
            data = response.json()
            
            if 'error' in data:
                print(f"API Error: {data['error']}")
                break
                
            items = data.get('result', {}).get('items', [])
            total_nfts_checked += len(items)
            
            print(f"Checking {len(items)} NFTs on this page...")
            
            if not items:
                print("No more items found.")
                break
                
            for nft in items:
                content = nft.get('content', {})
                metadata = content.get('metadata', {})
                attributes = metadata.get('attributes', [])
                
                for attr in attributes:
                    if attr.get('trait_type') == 'rarity' and attr.get('value', '').lower() == 'ultimate':
                        nft_info = {
                            'id': nft['id'],
                            'name': metadata.get('name'),
                            'rarity': attr['value']
                        }
                        ultimate_nfts.append(nft_info)
                        print(f"\nFound ultimate NFT!")
                        print(f"Name: {nft_info['name']}")
                        print(f"ID: {nft_info['id']}")
                        print(f"Rarity: {nft_info['rarity']}")
            
            if len(items) < 1000:
                print("\nReached last page.")
                break
                
            page += 1
            print("Waiting before next request...")
            time.sleep(1)  # Increased delay to be safe
            
        except requests.exceptions.RequestException as e:
            print(f"\nError making request: {e}")
            break
        except Exception as e:
            print(f"\nUnexpected error: {e}")
            break
    
    return ultimate_nfts, total_nfts_checked

if __name__ == '__main__':
    collection_id = 'DGPTxgKaBPJv3Ng7dc9AFDpX6E7kgUMZEgyTm3VGWPW6'
    print(f"\nSearching for ultimate NFTs in collection: {collection_id}")
    
    ultimates, total_checked = search_ultimates(collection_id)
    
    print(f"\nSearch complete!")
    print(f"Total NFTs checked: {total_checked}")
    print(f"Found {len(ultimates)} ultimate NFTs")
    
    if ultimates:
        # Save results to file
        with open('ultimate_nfts.json', 'w') as f:
            json.dump(ultimates, f, indent=2)
        print("Results saved to ultimate_nfts.json")
        
        # Also print results to console
        print("\nUltimate NFTs found:")
        for nft in ultimates:
            print(f"- {nft['name']} ({nft['id']})") 