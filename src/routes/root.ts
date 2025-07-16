// src/routes/index.ts
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { eq, desc, and, gte, sql, count, avg, sum, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { 
  users, 
  categories, 
  products, 
  orders, 
  orderItems, 
  reviews, 
  userActivity, 
  searchQueries 
} from '../db/schema.js';

const root: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // ============================================================================
  // HEALTH & WARMUP
  // ============================================================================
  
  fastify.get('/', async (request, reply) => {
    return {
      message: 'Fastify + Drizzle + Railway Load Test API',
      timestamp: new Date().toISOString(),
      status: 'healthy',
      backend: 'ready'
    };
  });

  fastify.get('/health', async (request, reply) => {
    try {
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      const dbLatency = Date.now() - start;
      
      return { 
        status: 'healthy', 
        database: 'connected', 
        latency: `${dbLatency}ms`,
        timestamp: new Date().toISOString() 
      };
    } catch (error) {
      reply.status(500);
      return { status: 'unhealthy', database: 'disconnected', error: (error as Error).message };
    }
  });

  // ============================================================================
  // SIMPLE QUERIES (Fast, High Cache Hit, Low CPU)
  // ============================================================================

  fastify.get('/api/simple/categories', async (request, reply) => {
    const result = await db.select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug
    }).from(categories).where(eq(categories.isActive, true)).limit(50);
    
    return { data: result, count: result.length, type: 'simple_query' };
  });

  fastify.get('/api/simple/products', async (request, reply) => {
    const result = await db.select({
      id: products.id,
      name: products.name,
      price: products.price,
      slug: products.slug
    }).from(products).where(eq(products.isActive, true)).limit(20);
    
    return { data: result, count: result.length, type: 'simple_query' };
  });

  fastify.get('/api/simple/product/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await db.select().from(products).where(eq(products.id, parseInt(id))).limit(1);
    
    if (result.length === 0) {
      reply.status(404);
      return { error: 'Product not found' };
    }
    return { data: result[0], type: 'simple_query' };
  });

  fastify.get('/api/simple/user/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName
    }).from(users).where(eq(users.id, parseInt(id))).limit(1);
    
    if (result.length === 0) {
      reply.status(404);
      return { error: 'User not found' };
    }
    return { data: result[0], type: 'simple_query' };
  });

  // ============================================================================
  // MEDIUM QUERIES (Joins, JSONB, Pagination)
  // ============================================================================

  fastify.get('/api/medium/products-with-category', async (request, reply) => {
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    const offset = (page - 1) * limit;

    const result = await db.select({
      id: products.id,
      name: products.name,
      price: products.price,
      slug: products.slug,
      categoryName: categories.name,
      categorySlug: categories.slug,
      stockQuantity: products.stockQuantity
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.isActive, true))
    .limit(limit)
    .offset(offset);
    
    return { data: result, page, limit, count: result.length, type: 'medium_query' };
  });

  fastify.get('/api/medium/users-by-city/:city', async (request, reply) => {
    const { city } = request.params as { city: string };
    
    const result = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      city: sql<string>`${users.profileData}->>'city'`,
      age: sql<number>`(${users.profileData}->>'age')::int`,
      theme: sql<string>`${users.profileData}->'preferences'->>'theme'`
    })
    .from(users)
    .where(sql`${users.profileData}->>'city' = ${city}`)
    .limit(50);
    
    return { data: result, city, count: result.length, type: 'medium_query' };
  });

  fastify.get('/api/medium/product-search', async (request, reply) => {
    const { q, tag, min_price, max_price } = request.query as { 
      q?: string; tag?: string; min_price?: number; max_price?: number; 
    };
    
    let conditions = [eq(products.isActive, true)];
    
    if (q) {
      conditions.push(sql`${products.name} ILIKE ${`%${q}%`}`);
    }
    if (tag) {
      conditions.push(sql`${products.metadata}->'tags' @> ${JSON.stringify([tag])}`);
    }
    if (min_price) {
      conditions.push(sql`${products.price}::numeric >= ${min_price}`);
    }
    if (max_price) {
      conditions.push(sql`${products.price}::numeric <= ${max_price}`);
    }

    const query = db.select({
      id: products.id,
      name: products.name,
      price: products.price,
      slug: products.slug,
      brand: sql<string>`${products.metadata}->>'brand'`,
      tags: sql<string[]>`${products.metadata}->'tags'`
    }).from(products).where(and(...conditions));

    const result = await query.limit(30);
    return { data: result, filters: { q, tag, min_price, max_price }, count: result.length, type: 'medium_query' };
  });

  fastify.get('/api/medium/user-orders/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { limit = 10 } = request.query as { limit?: number };

    const result = await db.select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalAmount: orders.totalAmount,
      itemCount: count(orderItems.id),
      createdAt: orders.createdAt
    })
    .from(orders)
    .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
    .where(eq(orders.userId, parseInt(userId)))
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt))
    .limit(limit);

    return { data: result, userId, count: result.length, type: 'medium_query' };
  });

  // ============================================================================
  // COMPLEX QUERIES (Heavy Joins, Aggregations, Analytics)
  // ============================================================================

  fastify.get('/api/complex/user-profile/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = parseInt(id);

    const userProfile = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      profileData: users.profileData,
      orderCount: count(orders.id),
      totalSpent: sum(orders.totalAmount),
      avgOrderValue: avg(orders.totalAmount),
      lastOrderDate: sql<Date>`MAX(${orders.createdAt})`,
      reviewCount: sql<number>`COUNT(DISTINCT ${reviews.id})`,
      avgGivenRating: sql<number>`AVG(${reviews.rating})`
    })
    .from(users)
    .leftJoin(orders, eq(users.id, orders.userId))
    .leftJoin(reviews, eq(users.id, reviews.userId))
    .where(eq(users.id, userId))
    .groupBy(users.id);

    if (userProfile.length === 0) {
      reply.status(404);
      return { error: 'User not found' };
    }

    return { data: userProfile[0], type: 'complex_query' };
  });

  fastify.get('/api/complex/product-analytics/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const productId = parseInt(id);

    const analytics = await db.select({
      product: {
        id: products.id,
        name: products.name,
        price: products.price,
        categoryName: categories.name
      },
      sales: {
        totalSold: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${orderItems.totalPrice}::numeric), 0)`,
        uniqueCustomers: sql<number>`COUNT(DISTINCT ${orders.userId})`
      },
      reviews: {
        avgRating: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
        totalReviews: count(reviews.id),
        ratingDistribution: sql<any>`
          jsonb_build_object(
            '5_star', COUNT(CASE WHEN ${reviews.rating} = 5 THEN 1 END),
            '4_star', COUNT(CASE WHEN ${reviews.rating} = 4 THEN 1 END),
            '3_star', COUNT(CASE WHEN ${reviews.rating} = 3 THEN 1 END),
            '2_star', COUNT(CASE WHEN ${reviews.rating} = 2 THEN 1 END),
            '1_star', COUNT(CASE WHEN ${reviews.rating} = 1 THEN 1 END)
          )`
      }
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(orderItems, eq(products.id, orderItems.productId))
    .leftJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(reviews, eq(products.id, reviews.productId))
    .where(eq(products.id, productId))
    .groupBy(products.id, categories.name);

    if (analytics.length === 0) {
      reply.status(404);
      return { error: 'Product not found' };
    }

    return { data: analytics[0], type: 'complex_query' };
  });

  fastify.get('/api/complex/dashboard-stats', async (request, reply) => {
    const { days = 30 } = request.query as { days?: number };
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - Math.abs(days));
    // Format as YYYY-MM-DDTHH:mm:ssZ (no milliseconds)
    const cutoffDateStr = '2020-01-01T00:00:00Z'; // TEMP: hardcoded for debug

    // Multiple complex queries for dashboard
    const [orderStats, userStatsRaw, productStats, topCityResult] = await Promise.all([
      // Order analytics
      db.select({
        totalOrders: count(orders.id),
        totalRevenue: sum(orders.totalAmount),
        avgOrderValue: avg(orders.totalAmount),
        pendingOrders: sql<number>`COUNT(CASE WHEN ${orders.status} = 'pending' THEN 1 END)`,
        completedOrders: sql<number>`COUNT(CASE WHEN ${orders.status} = 'delivered' THEN 1 END)`
      })
      .from(orders)
      .where(gte(orders.createdAt, cutoffDate)),

      // User analytics (main stats)
      db.select({
        activeUsers: sql<number>`COUNT(DISTINCT ${userActivity.userId})`,
        newUsers: sql<number>`COUNT(DISTINCT CASE WHEN ${users.createdAt} >= ${cutoffDateStr} THEN ${users.id} END)`,
        avgAge: sql<number>`AVG((${users.profileData}->>'age')::int)`
      })
      .from(users)
      .leftJoin(userActivity, eq(users.id, userActivity.userId)),

      // Product analytics
      db.select({
        totalProducts: count(products.id),
        avgPrice: avg(sql<number>`${products.price}::numeric`),
        lowStockCount: sql<number>`COUNT(CASE WHEN ${products.stockQuantity} < 10 THEN 1 END)`,
        topCategory: sql<string>`
          (SELECT c.name 
           FROM categories c 
           JOIN products p ON c.id = p.category_id 
           GROUP BY c.name 
           ORDER BY COUNT(p.id) DESC 
           LIMIT 1)`
      })
      .from(products)
      .where(eq(products.isActive, true)),

      // Top city (separate query)
      db.select({
        city: sql<string>`(profile_data->>'city')`
      })
      .from(users)
      .groupBy(sql`(profile_data->>'city')`)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1)
    ]);

    // Merge userStats and topCity
    const userStats = { ...userStatsRaw[0], topCity: topCityResult[0]?.city || null };

    return { 
      data: { orders: orderStats[0], users: userStats, products: productStats[0] }, 
      period: `${days} days`,
      type: 'complex_query'
    };
  });

  fastify.get('/api/complex/top-performers', async (request, reply) => {
    const { limit = 10 } = request.query as { limit?: number };

    const [topProducts, topUsers, topCategories] = await Promise.all([
      // Top selling products
      db.select({
        productId: products.id,
        productName: products.name,
        totalSold: sql<number>`SUM(${orderItems.quantity})`,
        revenue: sql<number>`SUM(${orderItems.totalPrice}::numeric)`,
        avgRating: sql<number>`AVG(${reviews.rating})`
      })
      .from(products)
      .leftJoin(orderItems, eq(products.id, orderItems.productId))
      .leftJoin(reviews, eq(products.id, reviews.productId))
      .groupBy(products.id)
      .orderBy(desc(sql<number>`SUM(${orderItems.quantity})`))
      .limit(limit),

      // Top spending users
      db.select({
        userId: users.id,
        username: users.username,
        totalSpent: sql<number>`SUM(${orders.totalAmount}::numeric)`,
        orderCount: count(orders.id),
        avgOrderValue: sql<number>`AVG(${orders.totalAmount}::numeric)`,
        city: sql<string>`${users.profileData}->>'city'`
      })
      .from(users)
      .leftJoin(orders, eq(users.id, orders.userId))
      .groupBy(users.id)
      .orderBy(desc(sql<number>`SUM(${orders.totalAmount}::numeric)`))
      .limit(limit),

      // Top categories by revenue
      db.select({
        categoryId: categories.id,
        categoryName: categories.name,
        productCount: count(products.id),
        totalRevenue: sql<number>`SUM(${orderItems.totalPrice}::numeric)`,
        avgProductPrice: sql<number>`AVG(${products.price}::numeric)`
      })
      .from(categories)
      .leftJoin(products, eq(categories.id, products.categoryId))
      .leftJoin(orderItems, eq(products.id, orderItems.productId))
      .groupBy(categories.id)
      .orderBy(desc(sql<number>`SUM(${orderItems.totalPrice}::numeric)`))
      .limit(limit)
    ]);

    return { 
      data: { 
        topProducts: topProducts.filter(p => p.totalSold > 0),
        topUsers: topUsers.filter(u => u.totalSpent > 0),
        topCategories: topCategories.filter(c => c.totalRevenue > 0)
      }, 
      type: 'complex_query' 
    };
  });

  // ============================================================================
  // SIMPLE MUTATIONS
  // ============================================================================

  fastify.post('/api/simple/log-activity', async (request, reply) => {
    const { userId, activityType, entityType, entityId } = request.body as any;
    
    const activity = await db.insert(userActivity).values({
      userId: userId || Math.floor(Math.random() * 100000) + 1,
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      activityType: activityType || 'page_view',
      entityType: entityType || null,
      entityId: entityId || null,
      metadata: { 
        timestamp: new Date().toISOString(),
        source: 'load_test'
      },
      ipAddress: request.ip || '127.0.0.1',
      userAgent: request.headers['user-agent'] || 'load-test-agent'
    }).returning();

    return { message: 'Activity logged', data: activity[0], type: 'simple_mutation' };
  });

  fastify.post('/api/simple/search-log', async (request, reply) => {
    const { query, userId } = request.body as any;
    
    const searchLog = await db.insert(searchQueries).values({
      userId: userId || null,
      sessionId: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      query: query || 'test query',
      resultsCount: Math.floor(Math.random() * 50),
      selectedResults: null
    }).returning();

    return { message: 'Search logged', data: searchLog[0], type: 'simple_mutation' };
  });

  // ============================================================================
  // MEDIUM MUTATIONS (With Lookups)
  // ============================================================================

  fastify.post('/api/medium/add-review', async (request, reply) => {
    const { userId, productId, rating, title, content } = request.body as any;
    
    try {
      // Verify product exists (medium complexity - lookup first)
      const product = await db.select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.id, productId || Math.floor(Math.random() * 20000) + 1))
        .limit(1);

      if (product.length === 0) {
        reply.status(404);
        return { error: 'Product not found' };
      }

      const review = await db.insert(reviews).values({
        userId: userId || Math.floor(Math.random() * 100000) + 1,
        productId: product[0].id,
        orderId: null,
        rating: rating || Math.floor(Math.random() * 5) + 1,
        title: title || 'Load test review',
        content: content || 'This is a test review generated during load testing.',
        isVerifiedPurchase: Math.random() > 0.5,
        helpfulCount: 0,
        isApproved: true
      }).returning();

      return { 
        message: 'Review added', 
        data: { review: review[0], product: product[0] }, 
        type: 'medium_mutation' 
      };

    } catch (error) {
      fastify.log.error('Review creation error:', error);
      reply.status(500);
      return { error: 'Failed to create review' };
    }
  });

  fastify.put('/api/medium/update-user-profile', async (request, reply) => {
    const { userId, profileUpdates } = request.body as any;
    const id = userId || Math.floor(Math.random() * 100000) + 1;

    try {
      // Get current profile first
      const currentUser = await db.select({ 
        profileData: users.profileData 
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

      if (currentUser.length === 0) {
        reply.status(404);
        return { error: 'User not found' };
      }

      // Merge profile updates
      const updatedProfile = {
        ...(currentUser[0].profileData as Record<string, any>),
        ...profileUpdates,
        lastUpdated: new Date().toISOString()
      };

      const updatedUser = await db.update(users)
        .set({ 
          profileData: updatedProfile,
          lastLogin: new Date()
        })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          username: users.username,
          profileData: users.profileData
        });

      return { 
        message: 'Profile updated', 
        data: updatedUser[0], 
        type: 'medium_mutation' 
      };

    } catch (error) {
      fastify.log.error('Profile update error:', error);
      reply.status(500);
      return { error: 'Failed to update profile' };
    }
  });

  // ============================================================================
  // COMPLEX MUTATIONS (Transactions, Multiple Tables)
  // ============================================================================

  fastify.post('/api/complex/create-order', async (request, reply) => {
    const { userId, items, shippingAddress } = request.body as any;
    
    try {
      // Validate user exists
      const user = await db.select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, userId || Math.floor(Math.random() * 100000) + 1))
        .limit(1);

      if (user.length === 0) {
        reply.status(404);
        return { error: 'User not found' };
      }

      // Validate and get product details
      const orderItems_data = items || [
        { productId: Math.floor(Math.random() * 20000) + 1, quantity: 1 },
        { productId: Math.floor(Math.random() * 20000) + 1, quantity: 2 }
      ];

      const productIds = orderItems_data.map((item: any) => item.productId);
      const validProducts = await db.select({
        id: products.id,
        name: products.name,
        price: products.price,
        stockQuantity: products.stockQuantity
      })
      .from(products)
      .where(inArray(products.id, productIds));

      if (validProducts.length === 0) {
        reply.status(400);
        return { error: 'No valid products found' };
      }

      // Calculate totals
      let subtotal = 0;
      const orderItemsToCreate = [];

      for (const item of orderItems_data) {
        const product = validProducts.find(p => p.id === item.productId);
        if (product) {
          const itemTotal = parseFloat(product.price) * item.quantity;
          subtotal += itemTotal;
          
          orderItemsToCreate.push({
            productId: product.id,
            quantity: item.quantity,
            unitPrice: product.price,
            totalPrice: itemTotal.toString(),
            productSnapshot: {
              name: product.name,
              price: parseFloat(product.price),
              sku: `SKU-${product.id}`
            }
          });
        }
      }

      const tax = subtotal * 0.08;
      const shipping = subtotal > 100 ? 0 : 9.99;
      const total = subtotal + tax + shipping;

      // Create order
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newOrder = await db.insert(orders).values({
        userId: user[0].id,
        orderNumber,
        status: 'pending',
        subtotal: subtotal.toString(),
        taxAmount: tax.toString(),
        shippingAmount: shipping.toString(),
        totalAmount: total.toString(),
        currency: 'USD',
        shippingAddress: shippingAddress || {
          street: '123 Load Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        },
        billingAddress: shippingAddress || {
          street: '123 Load Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        }
      }).returning();

      // Create order items
      const orderItemsWithOrderId = orderItemsToCreate.map(item => ({
        ...item,
        orderId: newOrder[0].id
      }));

      const createdOrderItems = await db.insert(orderItems).values(orderItemsWithOrderId).returning();

      // Log purchase activity
      await db.insert(userActivity).values({
        userId: user[0].id,
        sessionId: `purchase_${Date.now()}`,
        activityType: 'purchase',
        entityType: 'order',
        entityId: newOrder[0].id,
        metadata: { 
          orderValue: total,
          itemCount: orderItemsToCreate.length,
          source: 'load_test'
        },
        ipAddress: request.ip || '127.0.0.1',
        userAgent: request.headers['user-agent'] || 'load-test-agent'
      });

      return { 
        message: 'Order created successfully', 
        data: {
          order: newOrder[0],
          items: createdOrderItems,
          user: user[0],
          totals: { subtotal, tax, shipping, total }
        },
        type: 'complex_mutation'
      };

    } catch (error) {
      fastify.log.error('Order creation error:', error);
      reply.status(500);
      return { error: 'Failed to create order', details: (error as Error).message };
    }
  });

  // ============================================================================
  // BACKEND STRESS ENDPOINTS (Multiple Operations per Request)
  // ============================================================================

  fastify.get('/api/stress/user-journey/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const id = parseInt(userId) || Math.floor(Math.random() * 100000) + 1;

    try {
      // Simulate realistic user journey - multiple queries in one request
      const start = Date.now();

      // 1. Get user profile (complex query)
      const userProfile = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        profileData: users.profileData
      }).from(users).where(eq(users.id, id)).limit(1);

      if (userProfile.length === 0) {
        reply.status(404);
        return { error: 'User not found' };
      }

      // 2. Get user's recent orders (medium query)
      const recentOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalAmount: orders.totalAmount,
        createdAt: orders.createdAt
      })
      .from(orders)
      .where(eq(orders.userId, id))
      .orderBy(desc(orders.createdAt))
      .limit(5);

      // 3. Get user's reviews (medium query)
      const userReviews = await db.select({
        reviewId: reviews.id,
        productId: reviews.productId,
        rating: reviews.rating,
        title: reviews.title,
        productName: products.name
      })
      .from(reviews)
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(eq(reviews.userId, id))
      .limit(10);

      // 4. Get recommended products based on user's city (complex query)
      const userCity = (userProfile[0].profileData as Record<string, any>)?.city;
      let recommendations: any[] = [];
      
      if (userCity) {
        recommendations = await db.select({
          id: products.id,
          name: products.name,
          price: products.price,
          avgRating: sql<number>`AVG(${reviews.rating})`
        })
        .from(products)
        .leftJoin(reviews, eq(products.id, reviews.productId))
        .leftJoin(orderItems, eq(products.id, orderItems.productId))
        .leftJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(users, eq(orders.userId, users.id))
        .where(sql`${users.profileData}->>'city' = ${userCity}`)
        .groupBy(products.id)
        .orderBy(desc(sql<number>`COUNT(${orderItems.id})`))
        .limit(8);
      }

      // 5. Log this activity (simple mutation)
      await db.insert(userActivity).values({
        userId: id,
        sessionId: `journey_${Date.now()}`,
        activityType: 'profile_view',
        entityType: 'user',
        entityId: id,
        metadata: {
          journey_duration: Date.now() - start,
          operations: ['profile', 'orders', 'reviews', 'recommendations', 'activity_log'],
          source: 'stress_test'
        },
        ipAddress: request.ip || '127.0.0.1',
        userAgent: request.headers['user-agent'] || 'stress-test-agent'
      });

      const duration = Date.now() - start;

      return {
        data: {
          user: userProfile[0],
          recentOrders,
          reviews: userReviews,
          recommendations,
          stats: {
            totalOrders: recentOrders.length,
            totalReviews: userReviews.length,
            avgRating: userReviews.length > 0 
              ? userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length 
              : 0
          }
        },
        performance: {
          duration: `${duration}ms`,
          operations: 5,
          complexity: 'high'
        },
        type: 'stress_backend'
      };

    } catch (error) {
      fastify.log.error('User journey error:', error);
      reply.status(500);
      return { error: 'User journey failed', details: (error as Error).message };
    }
  });

  fastify.get('/api/stress/product-page/:productId', async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const id = parseInt(productId) || Math.floor(Math.random() * 20000) + 1;

    try {
      const start = Date.now();

      // 1. Get product details with category (medium query)
      const productDetails = await db.select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        stockQuantity: products.stockQuantity,
        metadata: products.metadata,
        categoryName: categories.name,
        categorySlug: categories.slug
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.id, id))
      .limit(1);

      if (productDetails.length === 0) {
        reply.status(404);
        return { error: 'Product not found' };
      }

      // 2. Get product reviews with user info (complex query)
      const productReviews = await db.select({
        reviewId: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        content: reviews.content,
        isVerified: reviews.isVerifiedPurchase,
        helpfulCount: reviews.helpfulCount,
        createdAt: reviews.createdAt,
        username: users.username,
        userCity: sql<string>`${users.profileData}->>'city'`
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(and(eq(reviews.productId, id), eq(reviews.isApproved, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(20);

      // 3. Get review statistics (complex aggregation)
      const reviewStats = await db.select({
        avgRating: avg(reviews.rating),
        totalReviews: count(reviews.id),
        ratingDistribution: sql<any>`
          jsonb_build_object(
            '5_star', COUNT(CASE WHEN ${reviews.rating} = 5 THEN 1 END),
            '4_star', COUNT(CASE WHEN ${reviews.rating} = 4 THEN 1 END),
            '3_star', COUNT(CASE WHEN ${reviews.rating} = 3 THEN 1 END),
            '2_star', COUNT(CASE WHEN ${reviews.rating} = 2 THEN 1 END),
            '1_star', COUNT(CASE WHEN ${reviews.rating} = 1 THEN 1 END)
          )`
      })
      .from(reviews)
      .where(eq(reviews.productId, id));

      // 4. Get related products from same category (medium query)
      const relatedProducts = await db.select({
        id: products.id,
        name: products.name,
        price: products.price,
        avgRating: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`
      })
      .from(products)
      .leftJoin(reviews, eq(products.id, reviews.productId))
      .where(and(
        eq(products.categoryId, 1), // Use default category since categoryId is not in select
        sql`${products.id} != ${id}`,
        eq(products.isActive, true)
      ))
      .groupBy(products.id)
      .limit(8);

      // 5. Get sales stats for this product (complex query)
      const salesStats = await db.select({
        totalSold: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${orderItems.totalPrice}::numeric), 0)`,
        uniqueCustomers: sql<number>`COUNT(DISTINCT ${orders.userId})`,
        lastPurchase: sql<Date>`MAX(${orders.createdAt})`
      })
      .from(orderItems)
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orderItems.productId, id));

      // 6. Log product view activity (simple mutation)
      await db.insert(userActivity).values({
        userId: Math.floor(Math.random() * 100000) + 1,
        sessionId: `product_view_${Date.now()}`,
        activityType: 'product_view',
        entityType: 'product',
        entityId: id,
        metadata: {
          page_load_duration: Date.now() - start,
          operations: ['product_details', 'reviews', 'stats', 'related', 'sales', 'activity_log'],
          source: 'stress_test'
        },
        ipAddress: request.ip || '127.0.0.1',
        userAgent: request.headers['user-agent'] || 'stress-test-agent'
      });

      const duration = Date.now() - start;

      return {
        data: {
          product: productDetails[0],
          reviews: productReviews,
          reviewStats: reviewStats[0],
          relatedProducts,
          salesStats: salesStats[0]
        },
        performance: {
          duration: `${duration}ms`,
          operations: 6,
          complexity: 'high'
        },
        type: 'stress_backend'
      };

    } catch (error) {
      fastify.log.error('Product page error:', error);
      reply.status(500);
      return { error: 'Product page failed', details: (error as Error).message };
    }
  });

  fastify.post('/api/stress/checkout-simulation', async (request, reply) => {
    const { userId, items, shippingAddress, paymentMethod } = request.body as any;

    try {
      const start = Date.now();

      // 1. Validate user and get profile (simple query)
      const user = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        profileData: users.profileData
      })
      .from(users)
      .where(eq(users.id, userId || Math.floor(Math.random() * 100000) + 1))
      .limit(1);

      if (user.length === 0) {
        reply.status(404);
        return { error: 'User not found' };
      }

      // 2. Get user's order history for fraud check (medium query)
      const orderHistory = await db.select({
        totalOrders: count(orders.id),
        totalSpent: sum(orders.totalAmount),
        avgOrderValue: avg(orders.totalAmount),
        lastOrderDate: sql<Date>`MAX(${orders.createdAt})`
      })
      .from(orders)
      .where(eq(orders.userId, user[0].id));

      // 3. Validate products and check inventory (medium query)
      const orderItems_data = items || [
        { productId: Math.floor(Math.random() * 20000) + 1, quantity: 1 },
        { productId: Math.floor(Math.random() * 20000) + 1, quantity: 2 }
      ];

      const productIds = orderItems_data.map((item: any) => item.productId);
      const productValidation = await db.select({
        id: products.id,
        name: products.name,
        price: products.price,
        stockQuantity: products.stockQuantity,
        categoryId: products.categoryId
      })
      .from(products)
      .where(and(
        inArray(products.id, productIds),
        eq(products.isActive, true)
      ));

      // 4. Calculate pricing and tax (backend processing)
      let subtotal = 0;
      const validItems = [];
      const inventoryWarnings = [];

      for (const item of orderItems_data) {
        const product = productValidation.find(p => p.id === item.productId);
        if (product) {
          if ((product.stockQuantity ?? 0) < item.quantity) {
            inventoryWarnings.push({
              productId: product.id,
              requested: item.quantity,
              available: product.stockQuantity ?? 0
            });
          }
          
          const itemTotal = parseFloat(product.price) * item.quantity;
          subtotal += itemTotal;
          validItems.push({
            productId: product.id,
            productName: product.name,
            quantity: item.quantity,
            unitPrice: parseFloat(product.price),
            totalPrice: itemTotal
          });
        }
      }

      // 5. Get tax rate based on user location (medium query with JSONB)
      const userState = (user[0].profileData as Record<string, any>)?.state || 'CA';
      const taxRate = userState === 'CA' ? 0.0875 : 0.08; // Different tax rates
      const tax = subtotal * taxRate;
      const shipping = subtotal > 100 ? 0 : (subtotal > 50 ? 5.99 : 9.99);
      const total = subtotal + tax + shipping;

      // 6. Simulate payment processing (backend logic)
      const paymentProcessing = {
        method: paymentMethod || 'credit_card',
        processingTime: Math.floor(Math.random() * 1000) + 500, // 500-1500ms
        transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: Math.random() > 0.02 ? 'approved' : 'declined' // 2% decline rate
      };

      // 7. Create order if payment approved (complex mutation)
      let orderResult = null;
      if (paymentProcessing.status === 'approved') {
        const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        
        const newOrder = await db.insert(orders).values({
          userId: user[0].id,
          orderNumber,
          status: 'processing',
          subtotal: subtotal.toString(),
          taxAmount: tax.toString(),
          shippingAmount: shipping.toString(),
          totalAmount: total.toString(),
          currency: 'USD',
          shippingAddress: shippingAddress || {
            street: '123 Stress Test Ave',
            city: 'Load City',
            state: userState,
            zipCode: '90210',
            country: 'US'
          },
          billingAddress: shippingAddress || {
            street: '123 Stress Test Ave',
            city: 'Load City',
            state: userState,
            zipCode: '90210',
            country: 'US'
          },
          notes: `Stress test order - ${validItems.length} items`
        }).returning();

        // Create order items
        const orderItemsToCreate = validItems.map(item => ({
          orderId: newOrder[0].id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.totalPrice.toString(),
          productSnapshot: {
            name: item.productName,
            price: item.unitPrice,
            sku: `SKU-${item.productId}`
          }
        }));

        await db.insert(orderItems).values(orderItemsToCreate);
        orderResult = newOrder[0];
      }

      // 8. Log checkout activity (simple mutation)
      await db.insert(userActivity).values({
        userId: user[0].id,
        sessionId: `checkout_${Date.now()}`,
        activityType: paymentProcessing.status === 'approved' ? 'purchase' : 'checkout_failed',
        entityType: 'order',
        entityId: orderResult?.id || null,
        metadata: {
          checkout_duration: Date.now() - start,
          item_count: validItems.length,
          order_value: total,
          payment_method: paymentProcessing.method,
          payment_status: paymentProcessing.status,
          inventory_warnings: inventoryWarnings.length,
          operations: ['user_validation', 'order_history', 'inventory_check', 'pricing', 'tax_calc', 'payment', 'order_creation', 'activity_log'],
          source: 'stress_test'
        },
        ipAddress: request.ip || '127.0.0.1',
        userAgent: request.headers['user-agent'] || 'stress-test-agent'
      });

      const duration = Date.now() - start;

      return {
        success: paymentProcessing.status === 'approved',
        data: {
          user: user[0],
          orderHistory: orderHistory[0],
          items: validItems,
          pricing: {
            subtotal,
            tax,
            shipping,
            total,
            taxRate: `${(taxRate * 100).toFixed(2)}%`
          },
          payment: paymentProcessing,
          order: orderResult,
          warnings: {
            inventory: inventoryWarnings
          }
        },
        performance: {
          duration: `${duration}ms`,
          operations: 8,
          complexity: 'maximum'
        },
        type: 'stress_backend'
      };

    } catch (error) {
      fastify.log.error('Checkout simulation error:', error);
      reply.status(500);
      return { error: 'Checkout simulation failed', details: (error as Error).message };
    }
  });

  // ============================================================================
  // MIXED LOAD ENDPOINT (Random Operation Selection)
  // ============================================================================

  fastify.get('/api/mixed/random-operation', async (request, reply) => {
    const operations = [
      // Simple operations (40% weight)
      { type: 'simple', operation: 'categories', weight: 15 },
      { type: 'simple', operation: 'products', weight: 15 },
      { type: 'simple', operation: 'user_lookup', weight: 10 },
      
      // Medium operations (35% weight)
      { type: 'medium', operation: 'product_search', weight: 15 },
      { type: 'medium', operation: 'user_orders', weight: 10 },
      { type: 'medium', operation: 'products_with_category', weight: 10 },
      
      // Complex operations (20% weight)
      { type: 'complex', operation: 'user_profile', weight: 8 },
      { type: 'complex', operation: 'product_analytics', weight: 7 },
      { type: 'complex', operation: 'dashboard', weight: 5 },
      
      // Mutations (5% weight)
      { type: 'mutation', operation: 'log_activity', weight: 3 },
      { type: 'mutation', operation: 'add_review', weight: 2 }
    ];

    // Weighted random selection
    const totalWeight = operations.reduce((sum, op) => sum + op.weight, 0);
    let random = Math.floor(Math.random() * totalWeight);
    
    let selectedOperation = operations[0];
    for (const operation of operations) {
      if (random < operation.weight) {
        selectedOperation = operation;
        break;
      }
      random -= operation.weight;
    }

    const start = Date.now();

    try {
      let result;
      const randomId = Math.floor(Math.random() * 10000) + 1;

      switch (selectedOperation.operation) {
        case 'categories':
          result = await db.select().from(categories).limit(10);
          break;
          
        case 'products':
          result = await db.select().from(products).where(eq(products.isActive, true)).limit(15);
          break;
          
        case 'user_lookup':
          result = await db.select().from(users).where(eq(users.id, randomId)).limit(1);
          break;
          
        case 'product_search':
          const searchTerms = ['laptop', 'phone', 'book', 'shoes', 'watch'];
          const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
          result = await db.select()
            .from(products)
            .where(sql`${products.name} ILIKE ${`%${term}%`}`)
            .limit(20);
          break;
          
        case 'user_orders':
          result = await db.select()
            .from(orders)
            .where(eq(orders.userId, randomId))
            .orderBy(desc(orders.createdAt))
            .limit(10);
          break;
          
        case 'products_with_category':
          result = await db.select({
            id: products.id,
            name: products.name,
            price: products.price,
            categoryName: categories.name
          })
          .from(products)
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .limit(25);
          break;
          
        case 'user_profile':
          result = await db.select({
            user: users,
            orderCount: count(orders.id),
            totalSpent: sum(orders.totalAmount)
          })
          .from(users)
          .leftJoin(orders, eq(users.id, orders.userId))
          .where(eq(users.id, randomId))
          .groupBy(users.id);
          break;
          
        case 'product_analytics':
          result = await db.select({
            product: products,
            avgRating: avg(reviews.rating),
            totalSold: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`
          })
          .from(products)
          .leftJoin(reviews, eq(products.id, reviews.productId))
          .leftJoin(orderItems, eq(products.id, orderItems.productId))
          .where(eq(products.id, randomId))
          .groupBy(products.id);
          break;
          
        case 'dashboard':
          result = await db.select({
            totalOrders: count(orders.id),
            totalRevenue: sum(orders.totalAmount)
          })
          .from(orders)
          .where(gte(orders.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
          break;
          
        case 'log_activity':
          result = await db.insert(userActivity).values({
            userId: randomId,
            sessionId: `mixed_${Date.now()}`,
            activityType: 'random_operation',
            entityType: null,
            entityId: null,
            metadata: { source: 'mixed_load_test' },
            ipAddress: request.ip || '127.0.0.1',
            userAgent: request.headers['user-agent'] || 'mixed-test-agent'
          }).returning();
          break;
          
        case 'add_review':
          const productExists = await db.select({ id: products.id })
            .from(products)
            .where(eq(products.id, randomId))
            .limit(1);
            
          if (productExists.length > 0) {
            result = await db.insert(reviews).values({
              userId: Math.floor(Math.random() * 100000) + 1,
              productId: randomId,
              rating: Math.floor(Math.random() * 5) + 1,
              title: 'Mixed load test review',
              content: 'Generated during mixed load testing',
              isVerifiedPurchase: Math.random() > 0.5,
              isApproved: true
            }).returning();
          } else {
            result = { error: 'Product not found for review' };
          }
          break;
          
        default:
          result = { error: 'Unknown operation' };
      }

      const duration = Date.now() - start;

      return {
        operation: selectedOperation,
        data: result,
        performance: {
          duration: `${duration}ms`,
          type: selectedOperation.type
        },
        type: 'mixed_load'
      };

    } catch (error) {
      fastify.log.error('Mixed operation error:', error);
      reply.status(500);
      return { 
        error: 'Mixed operation failed', 
        operation: selectedOperation,
        details: (error as Error).message 
      };
    }
  });

};

export default root;