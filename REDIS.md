# Redis Caching Implementation

This project now includes **Upstash Redis** caching to improve performance by reducing database load and speeding up frequently accessed data.

## 🚀 Quick Setup

### 1. Environment Variables

Add these environment variables to your `.env` file:

```bash
# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token-here
```

### 2. Get Upstash Redis Credentials

1. Sign up at [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database
3. Copy the REST URL and Token from the dashboard
4. Add them to your environment variables

### 3. Railway Deployment

For Railway deployment, add the environment variables in your Railway dashboard:

```bash
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token-here
```

## 📊 Caching Strategy

### Cache Hierarchy by Route Complexity

| Route Type | TTL (seconds) | Use Case |
|------------|---------------|----------|
| **Simple Queries** | 1800-3600 | Static data like categories, basic product lists |
| **Medium Queries** | 180-1200 | Paginated data, search results, user-specific data |
| **Complex Queries** | 120-240 | Heavy analytics, aggregations, dashboard stats |

### Specific Cache TTLs

- **Categories**: 3600s (1 hour) - rarely change
- **Products**: 1800s (30 minutes) - moderate changes
- **User Data**: 2400s (40 minutes) - relatively stable
- **Search Results**: 300s (5 minutes) - dynamic content
- **User Orders**: 180s (3 minutes) - frequently updated
- **Analytics**: 120-240s (2-4 minutes) - expensive but needs freshness
- **Dashboard Stats**: 150s (2.5 minutes) - balance of performance vs accuracy

## 🔧 Cache Management

### Built-in Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Check Redis connection status |
| `/api/cache/info` | GET | Get cache connection info |
| `/api/cache/stats` | GET | Test cache performance |
| `/api/cache/clear` | POST | Clear cache (use with caution) |

### Cache Invalidation

The application automatically invalidates related cache entries when:

- **Reviews are added**: Invalidates product analytics, top performers, dashboard stats
- **Orders are created**: Invalidates user profile, user orders, dashboard stats, product analytics

### Example Cache Usage

```typescript
// Simple cache operation
const result = await fastify.cache.withCache(
  'my-cache-key',
  async () => {
    return await expensiveOperation();
  },
  300 // TTL in seconds
);

// Manual cache operations
await fastify.cache.set('key', data, 600);
const cached = await fastify.cache.get('key');
await fastify.cache.del('key');
```

## 🔍 Monitoring

### Health Check

The `/health` endpoint now includes Redis latency:

```json
{
  "status": "healthy",
  "database": "connected", 
  "redis": "connected",
  "latency": {
    "database": "15ms",
    "redis": "8ms"
  }
}
```

### Cache Performance

Check `/api/cache/stats` for real-time cache performance metrics.

## 🛠️ Development

### Local Development

For local development, you can either:

1. **Use Upstash Redis** (recommended)
   - Sign up for free tier at Upstash
   - Get your credentials and add to `.env`

2. **Skip Redis** (graceful degradation)
   - Leave Redis environment variables empty
   - The application will work without caching (slower but functional)

### Cache Keys Structure

Cache keys follow this pattern:
```
{type}:{operation}:{parameters}
```

Examples:
- `simple:categories`
- `medium:product-search:laptop-null-null-null`
- `complex:user-profile:123`
- `complex:dashboard-stats:days-30`

## 🔄 Cache Invalidation Strategy

### Automatic Invalidation

- **Mutations automatically invalidate** related cached data
- **Smart invalidation** only clears relevant cache entries
- **Bulk operations** invalidate multiple related keys efficiently

### Manual Cache Management

Use the cache management endpoints for:
- Debugging cache issues
- Performance testing
- Manual cache clearing during deployments

## 📈 Performance Impact

Expected performance improvements:

- **Simple queries**: 50-80% faster (cached vs DB)
- **Medium queries**: 60-85% faster  
- **Complex queries**: 70-90% faster
- **Database load**: 40-70% reduction
- **Response times**: 100-500ms improvement for complex operations

## 🚨 Important Notes

1. **Upstash Redis** uses REST API (not Redis protocol) - perfect for serverless
2. **Graceful degradation** - app works without Redis (falls back to DB)
3. **TTL values** are optimized for load testing - adjust for production
4. **Cache invalidation** prevents stale data during mutations
5. **Environment variables** must be set for caching to work

## 🔧 Troubleshooting

### Common Issues

1. **Redis connection fails**
   - Check environment variables
   - Verify Upstash credentials
   - Check network connectivity

2. **Cache not working**
   - Verify environment variables are set
   - Check `/health` endpoint for Redis status
   - Look for error logs in application

3. **Stale data**
   - Use `/api/cache/clear` to reset cache
   - Check TTL values in route definitions
   - Verify cache invalidation is working

### Debug Commands

```bash
# Test cache connection
curl http://localhost:3000/health

# Get cache info  
curl http://localhost:3000/api/cache/info

# Test cache performance
curl http://localhost:3000/api/cache/stats

# Clear all cache (development only)
curl -X POST http://localhost:3000/api/cache/clear
``` 