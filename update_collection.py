from collections import updateCollection

collection_id = 'DGPTxgKaBPJv3Ng7dc9AFDpX6E7kgUMZEgyTm3VGWPW6'
name = "Degen Poet DRiP Season 1"  # Keep existing name
ultimates = True  # Set to show ultimate NFTs

success = updateCollection(collection_id, name, ultimates)
print(f"Update {'successful' if success else 'failed'}") 