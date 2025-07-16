// src/scripts/seed-data.ts
import { faker } from '@faker-js/faker';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../db/schema';

const { users, categories, products, orders, orderItems, reviews, userActivity, searchQueries } = schema;

// Helper function for retrying database operations
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`   ⚠️  Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}

// Helper function to validate data before insertion
function validateBatch(batch: any[], tableName: string): void {
  if (!Array.isArray(batch) || batch.length === 0) {
    throw new Error(`Invalid batch for ${tableName}: batch must be a non-empty array`);
  }
  
  // Basic validation for required fields
  for (let i = 0; i < batch.length; i++) {
    const record = batch[i];
    if (!record || typeof record !== 'object') {
      throw new Error(`Invalid record at index ${i} in ${tableName} batch`);
    }
  }
}

// Light Dataset Configuration
const DATASET_SIZE = {
  users: 100000,
  categories: 50,
  products: 20000,
  orders: 500000,
  orderItems: 1000000, // avg 2 items per order
  reviews: 200000, // 40% of orders get reviewed
  userActivity: 2000000, // 20 activities per user
  searchQueries: 600000, // search behavior
};

// Tiny Test Dataset Configuration
// const DATASET_SIZE = {
//   users: 100,
//   categories: 10,
//   products: 50,
//   orders: 200,
//   orderItems: 400, // avg 2 items per order
//   reviews: 80, // 40% of orders get reviewed
//   userActivity: 1000, // 10 activities per user
//   searchQueries: 300, // search behavior
// };

console.log('🌱 Light Dataset Configuration:');
console.log(DATASET_SIZE);
console.log('⏱️ Estimated time: 30-45 minutes\n');

async function truncateAllTables() {
  try {
    // Order: child tables first, then parents
    // CASCADE ensures all dependent data is removed
    const tables = [
      'order_items',
      'reviews',
      'user_activity',
      'search_queries',
      'orders',
      'products',
      'users',
      'categories',
    ];
    for (const table of tables) {
      await db.execute(sql`TRUNCATE TABLE ${sql.identifier(table)} RESTART IDENTITY CASCADE`);
    }
    console.log('🧹 Database truncated (all tables)');
  } catch (error) {
    console.error('❌ Failed to truncate database:', error);
    process.exit(1);
  }
}

async function seedCategories() {
  console.log('📂 Seeding categories...');
  const startTime = Date.now();
  
  const categoryData = [
    // Electronics
    { name: 'Electronics', slug: 'electronics', description: 'Electronic devices and gadgets', isActive: true },
    { name: 'Smartphones', slug: 'smartphones', description: 'Mobile phones and accessories', isActive: true },
    { name: 'Laptops', slug: 'laptops', description: 'Computers and laptops', isActive: true },
    { name: 'Gaming', slug: 'gaming', description: 'Gaming consoles and accessories', isActive: true },
    { name: 'Audio', slug: 'audio', description: 'Headphones, speakers, and audio equipment', isActive: true },
    
    // Fashion
    { name: 'Fashion', slug: 'fashion', description: 'Clothing and fashion items', isActive: true },
    { name: 'Men\'s Clothing', slug: 'mens-clothing', description: 'Men\'s apparel', isActive: true },
    { name: 'Women\'s Clothing', slug: 'womens-clothing', description: 'Women\'s apparel', isActive: true },
    { name: 'Shoes', slug: 'shoes', description: 'Footwear for all occasions', isActive: true },
    { name: 'Accessories', slug: 'accessories', description: 'Fashion accessories', isActive: true },
    
    // Home & Garden
    { name: 'Home & Garden', slug: 'home-garden', description: 'Home improvement and gardening', isActive: true },
    { name: 'Furniture', slug: 'furniture', description: 'Home and office furniture', isActive: true },
    { name: 'Kitchen', slug: 'kitchen', description: 'Kitchen appliances and tools', isActive: true },
    { name: 'Decor', slug: 'decor', description: 'Home decoration items', isActive: true },
    { name: 'Tools', slug: 'tools', description: 'Hardware and tools', isActive: true },
    
    // Health & Beauty
    { name: 'Health & Beauty', slug: 'health-beauty', description: 'Health and beauty products', isActive: true },
    { name: 'Skincare', slug: 'skincare', description: 'Skincare products', isActive: true },
    { name: 'Makeup', slug: 'makeup', description: 'Cosmetics and makeup', isActive: true },
    { name: 'Fitness', slug: 'fitness', description: 'Fitness and exercise equipment', isActive: true },
    { name: 'Supplements', slug: 'supplements', description: 'Health supplements', isActive: true },
    
    // Sports & Outdoors
    { name: 'Sports & Outdoors', slug: 'sports-outdoors', description: 'Sports and outdoor equipment', isActive: true },
    { name: 'Camping', slug: 'camping', description: 'Camping and hiking gear', isActive: true },
    { name: 'Cycling', slug: 'cycling', description: 'Bicycles and cycling gear', isActive: true },
    { name: 'Swimming', slug: 'swimming', description: 'Swimming equipment', isActive: true },
    
    // Books & Media
    { name: 'Books & Media', slug: 'books-media', description: 'Books, movies, and media', isActive: true },
    { name: 'Fiction', slug: 'fiction', description: 'Fiction books', isActive: true },
    { name: 'Non-Fiction', slug: 'non-fiction', description: 'Non-fiction books', isActive: true },
    { name: 'Movies', slug: 'movies', description: 'Movies and TV shows', isActive: true },
    { name: 'Music', slug: 'music', description: 'Music and audio content', isActive: true },
    
    // Automotive
    { name: 'Automotive', slug: 'automotive', description: 'Car parts and accessories', isActive: true },
    { name: 'Car Electronics', slug: 'car-electronics', description: 'Car audio and electronics', isActive: true },
    { name: 'Car Care', slug: 'car-care', description: 'Car cleaning and maintenance', isActive: true },
    
    // Toys & Games
    { name: 'Toys & Games', slug: 'toys-games', description: 'Toys and games for all ages', isActive: true },
    { name: 'Board Games', slug: 'board-games', description: 'Board and card games', isActive: true },
    { name: 'Action Figures', slug: 'action-figures', description: 'Collectible figures', isActive: true },
    { name: 'Educational', slug: 'educational', description: 'Educational toys', isActive: true },
    
    // Pet Supplies
    { name: 'Pet Supplies', slug: 'pet-supplies', description: 'Pet food and accessories', isActive: true },
    { name: 'Dog Supplies', slug: 'dog-supplies', description: 'Dog food and accessories', isActive: true },
    { name: 'Cat Supplies', slug: 'cat-supplies', description: 'Cat food and accessories', isActive: true },
    
    // Office Supplies
    { name: 'Office Supplies', slug: 'office-supplies', description: 'Office and business supplies', isActive: true },
    { name: 'Stationery', slug: 'stationery', description: 'Pens, paper, and stationery', isActive: true },
    { name: 'Office Furniture', slug: 'office-furniture', description: 'Desks, chairs, and office furniture', isActive: true },
    
    // Baby & Kids
    { name: 'Baby & Kids', slug: 'baby-kids', description: 'Baby and children products', isActive: true },
    { name: 'Baby Clothing', slug: 'baby-clothing', description: 'Baby clothes and accessories', isActive: true },
    { name: 'Kids Toys', slug: 'kids-toys', description: 'Toys for children', isActive: true },
  ];

  validateBatch(categoryData, 'categories');
  
  // Insert and get the returned IDs
  const insertedCategories = await retryOperation(() => 
    db.insert(categories).values(categoryData).returning({ id: categories.id })
  );
  
  // Store the IDs for later use
  const categoryIds = insertedCategories.map(c => c.id);
  
  const endTime = Date.now();
  console.log(`✅ Categories seeded: ${categoryData.length} records in ${endTime - startTime}ms`);
  console.log(`   Category IDs: ${Math.min(...categoryIds)}-${Math.max(...categoryIds)}\n`);
  
  return categoryIds; // Return the IDs
}

async function seedUsers() {
  console.log('👥 Seeding users...');
  const startTime = Date.now();
  const batchSize = 2000;
  
  for (let i = 0; i < DATASET_SIZE.users; i += batchSize) {
    const batch: any[] = [];
    const currentBatchSize = Math.min(batchSize, DATASET_SIZE.users - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      batch.push({
        email: `${faker.internet.email().split('@')[0]}_${i + j}_${Date.now()}@${faker.internet.email().split('@')[1]}`,
        username: `${faker.internet.username()}_${i + j}_${Date.now()}`,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        profileData: {
          city: faker.location.city(),
          country: faker.location.country(),
          age: faker.number.int({ min: 18, max: 65 }),
          preferences: {
            theme: faker.helpers.arrayElement(['light', 'dark', 'auto']),
            language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'it']),
            notifications: faker.datatype.boolean(),
            newsletter: faker.datatype.boolean(),
          },
          metadata: {
            signupSource: faker.helpers.arrayElement(['web', 'mobile', 'referral', 'social']),
            marketingOptIn: faker.datatype.boolean(),
            timezone: faker.helpers.arrayElement(['UTC', 'EST', 'PST', 'CET', 'JST']),
          }
        },
        createdAt: faker.date.past({ years: 2 }),
        lastLogin: faker.datatype.boolean(0.8) ? faker.date.recent({ days: 30 }) : null,
        isActive: faker.datatype.boolean(0.95),
      });
    }
    
    validateBatch(batch, 'users');
    await retryOperation(() => db.insert(users).values(batch));
    
    // Clear batch to free memory
    batch.length = 0;
    
    if ((i + batchSize) % 10000 === 0 || i + batchSize >= DATASET_SIZE.users) {
      console.log(`   ${Math.min(i + batchSize, DATASET_SIZE.users)}/${DATASET_SIZE.users} users seeded...`);
    }
  }
  
  const endTime = Date.now();
  console.log(`✅ Users seeded: ${DATASET_SIZE.users} records in ${((endTime - startTime) / 1000).toFixed(1)}s\n`);
}

async function seedProducts(categoryIds: number[]) {
  console.log('📦 Seeding products...');
  const startTime = Date.now();
  const batchSize = 1000;
  
  for (let i = 0; i < DATASET_SIZE.products; i += batchSize) {
    const batch: any[] = [];
    const currentBatchSize = Math.min(batchSize, DATASET_SIZE.products - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const name = faker.commerce.productName();
      const price = parseFloat(faker.commerce.price({ min: 5, max: 2000 }));
      const compareAtPrice = faker.datatype.boolean(0.3) 
        ? parseFloat((price * faker.number.float({ min: 1.1, max: 1.5 })).toFixed(2))
        : null;
      
      batch.push({
        name,
        slug: `${faker.helpers.slugify(name).toLowerCase()}_${i + j}_${Date.now()}`,
        description: faker.commerce.productDescription(),
        categoryId: faker.helpers.arrayElement(categoryIds), // Use stored category IDs
        price: price.toString(),
        compareAtPrice: compareAtPrice?.toString(),
        stockQuantity: faker.number.int({ min: 0, max: 1000 }),
        sku: `${faker.string.alphanumeric({ length: 8, casing: 'upper' })}_${i + j}_${Date.now()}`,
        metadata: {
          brand: faker.company.name(),
          color: faker.color.human(),
          material: faker.helpers.arrayElement(['Cotton', 'Polyester', 'Metal', 'Plastic', 'Wood', 'Glass']),
          weight: faker.number.float({ min: 0.1, max: 50, multipleOf: 0.1 }),
          dimensions: {
            length: faker.number.float({ min: 1, max: 100, multipleOf: 0.1 }),
            width: faker.number.float({ min: 1, max: 100, multipleOf: 0.1 }),
            height: faker.number.float({ min: 1, max: 100, multipleOf: 0.1 }),
          },
          tags: faker.helpers.arrayElements(['bestseller', 'new-arrival', 'sale', 'featured', 'organic', 'eco-friendly'], { min: 0, max: 3 }),
          rating: faker.number.float({ min: 1, max: 5, multipleOf: 0.1 }),
          images: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => faker.image.url()),
        },
        isActive: faker.datatype.boolean(0.95),
        createdAt: faker.date.past({ years: 1 }),
        updatedAt: faker.date.recent({ days: 30 }),
      });
    }
    
    validateBatch(batch, 'products');
    await retryOperation(() => db.insert(products).values(batch));
    
    // Clear batch to free memory
    batch.length = 0;
    
    if ((i + batchSize) % 5000 === 0 || i + batchSize >= DATASET_SIZE.products) {
      console.log(`   ${Math.min(i + batchSize, DATASET_SIZE.products)}/${DATASET_SIZE.products} products seeded...`);
    }
  }
  
  const endTime = Date.now();
  console.log(`✅ Products seeded: ${DATASET_SIZE.products} records in ${((endTime - startTime) / 1000).toFixed(1)}s\n`);
}

async function seedOrders() {
  console.log('🛒 Seeding orders...');
  const startTime = Date.now();
  const batchSize = 1000;
  
  for (let i = 0; i < DATASET_SIZE.orders; i += batchSize) {
    const batch: any[] = [];
    const currentBatchSize = Math.min(batchSize, DATASET_SIZE.orders - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const subtotal = parseFloat(faker.commerce.price({ min: 10, max: 500 }));
      const taxAmount = parseFloat((subtotal * 0.08).toFixed(2)); // 8% tax
      const shippingAmount = parseFloat(faker.commerce.price({ min: 0, max: 25 }));
      const totalAmount = parseFloat((subtotal + taxAmount + shippingAmount).toFixed(2));
      
      batch.push({
        userId: faker.number.int({ min: 1, max: DATASET_SIZE.users }),
        orderNumber: `ORD-${faker.string.alphanumeric({ length: 8, casing: 'upper' })}_${i + j}_${Date.now()}`,
        status: faker.helpers.arrayElement(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        shippingAmount: shippingAmount.toString(),
        totalAmount: totalAmount.toString(),
        currency: 'USD',
        shippingAddress: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state(),
          zipCode: faker.location.zipCode(),
          country: faker.location.country(),
        },
        billingAddress: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state(),
          zipCode: faker.location.zipCode(),
          country: faker.location.country(),
        },
        notes: faker.datatype.boolean(0.2) ? faker.lorem.sentence() : null,
        createdAt: faker.date.past({ years: 1 }),
        updatedAt: faker.date.recent({ days: 10 }),
      });
    }
    
    validateBatch(batch, 'orders');
    await retryOperation(() => db.insert(orders).values(batch));
    
    // Clear batch to free memory
    batch.length = 0;
    
    if ((i + batchSize) % 10000 === 0 || i + batchSize >= DATASET_SIZE.orders) {
      console.log(`   ${Math.min(i + batchSize, DATASET_SIZE.orders)}/${DATASET_SIZE.orders} orders seeded...`);
    }
  }
  
  const endTime = Date.now();
  console.log(`✅ Orders seeded: ${DATASET_SIZE.orders} records in ${((endTime - startTime) / 1000).toFixed(1)}s\n`);
}

async function seedOrderItems() {
  console.log('📋 Seeding order items...');
  const startTime = Date.now();
  const batchSize = 2000;
  
  for (let i = 0; i < DATASET_SIZE.orderItems; i += batchSize) {
    const batch: any[] = [];
    const currentBatchSize = Math.min(batchSize, DATASET_SIZE.orderItems - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const quantity = faker.number.int({ min: 1, max: 5 });
      const unitPrice = parseFloat(faker.commerce.price({ min: 5, max: 200 }));
      const totalPrice = parseFloat((quantity * unitPrice).toFixed(2));
      
      batch.push({
        orderId: faker.number.int({ min: 1, max: DATASET_SIZE.orders }),
        productId: faker.number.int({ min: 1, max: DATASET_SIZE.products }),
        quantity,
        unitPrice: unitPrice.toString(),
        totalPrice: totalPrice.toString(),
        productSnapshot: {
          name: faker.commerce.productName(),
          price: unitPrice,
          sku: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
          description: faker.commerce.productDescription(),
        },
        createdAt: faker.date.past({ years: 1 }),
      });
    }
    
    validateBatch(batch, 'orderItems');
    await retryOperation(() => db.insert(orderItems).values(batch));
    
    // Clear batch to free memory
    batch.length = 0;
    
    if ((i + batchSize) % 20000 === 0 || i + batchSize >= DATASET_SIZE.orderItems) {
      console.log(`   ${Math.min(i + batchSize, DATASET_SIZE.orderItems)}/${DATASET_SIZE.orderItems} order items seeded...`);
    }
  }
  
  const endTime = Date.now();
  console.log(`✅ Order items seeded: ${DATASET_SIZE.orderItems} records in ${((endTime - startTime) / 1000).toFixed(1)}s\n`);
}

async function seedReviews() {
  console.log('⭐ Seeding reviews...');
  const startTime = Date.now();
  const batchSize = 1000;
  
  for (let i = 0; i < DATASET_SIZE.reviews; i += batchSize) {
    const batch: any[] = [];
    const currentBatchSize = Math.min(batchSize, DATASET_SIZE.reviews - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const rating = faker.helpers.weightedArrayElement([
        { weight: 5, value: 5 },
        { weight: 4, value: 4 },
        { weight: 3, value: 3 },
        { weight: 2, value: 2 },
        { weight: 1, value: 1 },
      ]);
      
      batch.push({
        productId: faker.number.int({ min: 1, max: DATASET_SIZE.products }),
        userId: faker.number.int({ min: 1, max: DATASET_SIZE.users }),
        orderId: faker.datatype.boolean(0.8) ? faker.number.int({ min: 1, max: DATASET_SIZE.orders }) : null,
        rating,
        title: faker.lorem.sentence({ min: 3, max: 8 }),
        content: faker.lorem.paragraphs({ min: 1, max: 3 }),
        isVerifiedPurchase: faker.datatype.boolean(0.7),
        helpfulCount: faker.number.int({ min: 0, max: 50 }),
        isApproved: faker.datatype.boolean(0.95),
        createdAt: faker.date.past({ years: 1 }),
        updatedAt: faker.date.recent({ days: 30 }),
      });
    }
    
    validateBatch(batch, 'reviews');
    await retryOperation(() => db.insert(reviews).values(batch));
    
    // Clear batch to free memory
    batch.length = 0;
    
    if ((i + batchSize) % 10000 === 0 || i + batchSize >= DATASET_SIZE.reviews) {
      console.log(`   ${Math.min(i + batchSize, DATASET_SIZE.reviews)}/${DATASET_SIZE.reviews} reviews seeded...`);
    }
  }
  
  const endTime = Date.now();
  console.log(`✅ Reviews seeded: ${DATASET_SIZE.reviews} records in ${((endTime - startTime) / 1000).toFixed(1)}s\n`);
}

async function seedUserActivity() {
  console.log('📊 Seeding user activity...');
  const startTime = Date.now();
  const batchSize = 5000;
  
  type ActivityType = {
    type: string;
    entity: string | null;
  };

  const activityTypes: Array<{ value: ActivityType; weight: number }> = [
    { value: { type: 'page_view', entity: 'product' }, weight: 40 },
    { value: { type: 'product_view', entity: 'product' }, weight: 25 },
    { value: { type: 'add_to_cart', entity: 'product' }, weight: 10 },
    { value: { type: 'purchase', entity: 'order' }, weight: 5 },
    { value: { type: 'search', entity: null }, weight: 15 },
    { value: { type: 'login', entity: null }, weight: 3 },
    { value: { type: 'logout', entity: null }, weight: 2 },
  ];
  
  for (let i = 0; i < DATASET_SIZE.userActivity; i += batchSize) {
    const batch: any[] = [];
    const currentBatchSize = Math.min(batchSize, DATASET_SIZE.userActivity - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const activity = faker.helpers.weightedArrayElement(activityTypes);
      let entityId = null;
      
      if (activity.entity === 'product') {
        entityId = faker.number.int({ min: 1, max: DATASET_SIZE.products });
      } else if (activity.entity === 'order') {
        entityId = faker.number.int({ min: 1, max: DATASET_SIZE.orders });
      }
      
      // Generate user agent once to ensure consistency
      const userAgent = faker.internet.userAgent();
      
      batch.push({
        userId: faker.number.int({ min: 1, max: DATASET_SIZE.users }),
        sessionId: faker.string.uuid(),
        activityType: activity.type,
        entityType: activity.entity,
        entityId,
        metadata: {
          userAgent,
          referrer: faker.internet.url(),
          duration: activity.type === 'page_view' ? faker.number.int({ min: 1, max: 300 }) : null,
          clickPosition: activity.type === 'product_view' ? faker.number.int({ min: 1, max: 20 }) : null,
        },
        ipAddress: faker.internet.ip(),
        userAgent,
        createdAt: faker.date.past({ years: 1 }),
      });
    }
    
    validateBatch(batch, 'userActivity');
    await retryOperation(() => db.insert(userActivity).values(batch));
    
    // Clear batch to free memory
    batch.length = 0;

    if (global.gc && (i + batchSize) % 50000 === 0) {
      global.gc();
    }
    
    if ((i + batchSize) % 50000 === 0 || i + batchSize >= DATASET_SIZE.userActivity) {
      console.log(`   ${Math.min(i + batchSize, DATASET_SIZE.userActivity)}/${DATASET_SIZE.userActivity} activities seeded...`);
    }
  }
  
  const endTime = Date.now();
  console.log(`✅ User activity seeded: ${DATASET_SIZE.userActivity} records in ${((endTime - startTime) / 1000).toFixed(1)}s\n`);
}

async function seedSearchQueries() {
  console.log('🔍 Seeding search queries...');
  const startTime = Date.now();
  const batchSize = 2000;
  
  const popularQueries = [
    'laptop', 'phone', 'headphones', 'shoes', 'dress', 'watch', 'book', 'camera',
    'tablet', 'backpack', 'sunglasses', 'perfume', 'jacket', 'jeans', 'sneakers',
    'wireless', 'bluetooth', 'gaming', 'fitness', 'kitchen', 'home decor',
  ];
  
  for (let i = 0; i < DATASET_SIZE.searchQueries; i += batchSize) {
    const batch: any[] = [];
    const currentBatchSize = Math.min(batchSize, DATASET_SIZE.searchQueries - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const isPopularQuery = faker.datatype.boolean(0.6);
      const query = isPopularQuery 
        ? faker.helpers.arrayElement(popularQueries)
        : faker.commerce.productName().split(' ').slice(0, 2).join(' ').toLowerCase();
      
      const resultsCount = faker.number.int({ min: 0, max: 1000 });
      const clickedResults = resultsCount > 0 && faker.datatype.boolean(0.7) 
        ? Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => ({
            productId: faker.number.int({ min: 1, max: DATASET_SIZE.products }),
            position: faker.number.int({ min: 1, max: 20 }),
            clickTime: faker.date.recent({ days: 1 }),
          }))
        : null;
      
      batch.push({
        userId: faker.datatype.boolean(0.8) ? faker.number.int({ min: 1, max: DATASET_SIZE.users }) : null,
        sessionId: faker.string.uuid(),
        query,
        resultsCount,
        selectedResults: clickedResults,
        createdAt: faker.date.past({ years: 1 }),
      });
    }
    
    validateBatch(batch, 'searchQueries');
    await retryOperation(() => db.insert(searchQueries).values(batch));
    
    // Clear batch to free memory
    batch.length = 0;

    if (global.gc && (i + batchSize) % 20000 === 0) {
      global.gc();
    }
    
    if ((i + batchSize) % 20000 === 0 || i + batchSize >= DATASET_SIZE.searchQueries) {
      console.log(`   ${Math.min(i + batchSize, DATASET_SIZE.searchQueries)}/${DATASET_SIZE.searchQueries} search queries seeded...`);
    }
  }
  
  const endTime = Date.now();
  console.log(`✅ Search queries seeded: ${DATASET_SIZE.searchQueries} records in ${((endTime - startTime) / 1000).toFixed(1)}s\n`);
}

async function main() {
  const overallStart = Date.now();

  // Check for --reset flag
  const shouldReset = process.argv.includes('--reset');
  if (shouldReset) {
    await truncateAllTables();
  }
  
  try {
    console.log('🚀 Starting Light Dataset Seeding...\n');
    
    // Seed data in dependency order
    const categoryIds = await seedCategories();
    await seedUsers();
    await seedProducts(categoryIds);
    await seedOrders();
    await seedOrderItems();
    await seedReviews();
    await seedUserActivity();
    await seedSearchQueries();
    
    const overallEnd = Date.now();
    const totalTime = ((overallEnd - overallStart) / 1000 / 60).toFixed(1);
    
    console.log('🎉 Seeding completed successfully!');
    console.log(`⏱️  Total time: ${totalTime} minutes`);
    console.log('\n📊 Dataset Summary:');
    console.log(`   Users: ${DATASET_SIZE.users.toLocaleString()}`);
    console.log(`   Products: ${DATASET_SIZE.products.toLocaleString()}`);
    console.log(`   Orders: ${DATASET_SIZE.orders.toLocaleString()}`);
    console.log(`   Order Items: ${DATASET_SIZE.orderItems.toLocaleString()}`);
    console.log(`   Reviews: ${DATASET_SIZE.reviews.toLocaleString()}`);
    console.log(`   User Activities: ${DATASET_SIZE.userActivity.toLocaleString()}`);
    console.log(`   Search Queries: ${DATASET_SIZE.searchQueries.toLocaleString()}`);
    console.log('\n✅ Ready for load testing!');
    
    // Explicit exit on success
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}