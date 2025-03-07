// Cache implementation for Google Sheets data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const API_CALLS = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_CALLS_PER_WINDOW = 50; // Maximum calls per minute

// Check if we're within rate limits
function isRateLimited() {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;
    
    // Clean up old entries
    for (const [timestamp] of API_CALLS) {
        if (timestamp < windowStart) {
            API_CALLS.delete(timestamp);
        }
    }
    
    return API_CALLS.size >= MAX_CALLS_PER_WINDOW;
}

// Record an API call
function recordApiCall() {
    const now = Date.now();
    API_CALLS.set(now, true);
}

// Get cached data if available
function getCachedData(key) {
    const cached = cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expiry) {
        cache.delete(key);
        return null;
    }
    
    return cached.data;
}

// Cache data with expiration
function setCachedData(key, data) {
    cache.set(key, {
        data,
        expiry: Date.now() + CACHE_TTL
    });
}

// Clear expired cache entries
function clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of cache) {
        if (now > value.expiry) {
            cache.delete(key);
        }
    }
}

// Periodically clear expired cache
setInterval(clearExpiredCache, CACHE_TTL);

module.exports = {
    isRateLimited,
    recordApiCall,
    getCachedData,
    setCachedData
}; 