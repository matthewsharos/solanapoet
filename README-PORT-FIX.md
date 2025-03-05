# NFT Listing Port Issue Fix

## Problem

When attempting to list an NFT for sale, the client was receiving a 400 Bad Request error with the message "Missing required parameters". This was happening despite the client sending all the required parameters (`nftAddress`, `sellerAddress`, and `price`) in the request body.

## Investigation

We created test scripts to debug the issue:

1. `test-exact-request.js`: Sent the exact same request as the client to the server on port 3001, but it still returned "Missing required parameters".
2. `test-request-debug.js`: Tested different request formats and different ports, and discovered that:
   - The server on port 3001 was rejecting all requests with "Missing required parameters"
   - The server on port 3002 was accepting the exact same requests and returning successful responses

## Root Cause

The application was running two server instances:
- One on port 3001 that was not correctly processing the request body
- Another on port 3002 that was working correctly

The client code was configured to try port 3001 first, which was causing the error.

## Solution

We updated the `getApiBaseUrl` function in `src/api/marketplace.ts` to:
1. Try port 3002 first in the list of ports to check
2. Change the default fallback port from 3001 to 3002

```javascript
// Updated port order
const ports = [3002, 3001, 3011, 3021, 3031, 3041];

// Updated default fallback
console.warn('Could not detect server port, using default 3002');
return 'http://localhost:3002';
```

## Verification

We created a test script `test-port-3002.js` to verify that the server on port 3002 was working correctly. The test confirmed that:
1. The health endpoint on port 3002 returns a 200 OK response
2. The listing endpoint on port 3002 accepts our request and returns a successful response

## Next Steps

1. Try listing an NFT again using the updated client code
2. Consider consolidating the server instances to avoid confusion in the future
3. Add more logging to the server to help diagnose similar issues
4. Update any documentation or configuration files to reflect the correct port 