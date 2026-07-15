import Redis from 'ioredis';

// initial is null because no connection made yet
let redisClient = null;

export const connectRedis = () => {
    
    // if redis url not present in .env skip redis (app still works)
    if (!process.env.REDIS_URL) {
        console.log('REDIS_URL not set. Redis caching is disabled.');
        return null;
    }

    try {
        redisClient = new Redis(process.env.REDIS_URL, {
            // Upstash requires TLS (rediss:// = Redis + SSL)
            tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,

            
            maxRetriesPerRequest: 3, // if a command(get/set) fails rety 3 times before giving error
            
            // if connection failed how many time to retry and how much waiting time 
            retryStrategy(times) {
                if (times > 3) {
                    console.error('Redis: Could not connect after 3 retries. Disabling cache.');
                    return null;
                }
                return Math.min(times * 200, 1000); // the waiting time 2000ms
            },
        });

        // redis events
        redisClient.on('connect', () => {
            console.log('Redis connected successfully');
        });

        redisClient.on('error', (err) => {
            console.error('Redis error:', err.message);
        });

        return redisClient;
    } catch (error) {
        console.error('Redis connection failed:', error.message);
        return null;
    }
};



export const getRedisClient = () => redisClient;


// Helper: GET data from cache 
export const getCache = async (key) => {
    // if there not redis client exists return null
    if (!redisClient) return null;

    //if exists
    try {
        const value = await redisClient.get(key); // get the data/value of key
        return value ? JSON.parse(value) : null;  // if vlaue exists then parse it to JSON from object
    } catch (error) {
        console.error('Redis GET error:', error.message);
        return null;
    }
};


// Helper: SET to cache 
export const setCache = async (key, value, ttlSeconds = 60) => {
    // if thre not exists client reutr null
    if (!redisClient) return;

    // if exists
    try {
        // set the cache with the key value and expiry time
        await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds); // create the cache that expir tin 60 seconds
    } catch (error) {
        console.error('Redis SET error:', error.message);
    }
};


// Helper: DELETE from cache 
export const deleteCache = async (key) => {
    if (!redisClient) return;
    // if there not exists client return null

    // if exists
    try {
        // delete the key and value
        await redisClient.del(key);
    } catch (error) {
        console.error('Redis DEL error:', error.message);
    }
};


//  Helper: DELETE all keys matching a pattern
export const deleteCachePattern = async (pattern) => {
    if (!redisClient) return;

    try {
        // find all keys matching the pattern 
        const keys = await redisClient.keys(pattern);
        // if there eixts keys delete them 
        if (keys.length > 0) {
            await redisClient.del(...keys); // delete all elements of array
        }
    } catch (error) {
        console.error('Redis pattern DEL error:', error.message);
    }
};