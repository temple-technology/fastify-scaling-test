
import { 
  pgTable, 
  serial, 
  varchar, 
  decimal, 
  integer, 
  timestamp, 
  jsonb, 
  index,
  text,
  boolean 
} from 'drizzle-orm/pg-core';


export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  username: varchar('username', { length: 100 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  profileData: jsonb('profile_data'), 
  createdAt: timestamp('created_at').defaultNow(),
  lastLogin: timestamp('last_login'),
  isActive: boolean('is_active').default(true),
}, (table) => ({
  emailIdx: index('idx_users_email').on(table.email),
  usernameIdx: index('idx_users_username').on(table.username),
  lastLoginIdx: index('idx_users_last_login').on(table.lastLogin),
  activeUsersIdx: index('idx_users_active').on(table.isActive, table.lastLogin),
  
  cityIdx: index('idx_users_city').using('gin', table.profileData),
}));


export const categories = pgTable(
  'categories',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).unique().notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    slugIdx: index('idx_categories_slug').on(table.slug),
    activeIdx: index('idx_categories_active').on(table.isActive),
  })
);


export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).unique().notNull(),
    description: text('description'),
    categoryId: integer('category_id').references(() => categories.id),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    compareAtPrice: decimal('compare_at_price', { precision: 10, scale: 2 }),
    stockQuantity: integer('stock_quantity').default(0),
    sku: varchar('sku', { length: 100 }).unique(),
    metadata: jsonb('metadata'), 
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    categoryIdx: index('idx_products_category').on(table.categoryId),
    slugIdx: index('idx_products_slug').on(table.slug),
    skuIdx: index('idx_products_sku').on(table.sku),
    priceIdx: index('idx_products_price').on(table.price),
    stockIdx: index('idx_products_stock').on(table.stockQuantity),
    activeIdx: index('idx_products_active').on(table.isActive),
    
    metadataIdx: index('idx_products_metadata').using('gin', table.metadata),
  })
);


export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id).notNull(),
    orderNumber: varchar('order_number', { length: 50 }).unique().notNull(),
    status: varchar('status', { length: 50 }).default('pending'), 
    subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
    taxAmount: decimal('tax_amount', { precision: 10, scale: 2 }).default('0'),
    shippingAmount: decimal('shipping_amount', { precision: 10, scale: 2 }).default('0'),
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('USD'),
    shippingAddress: jsonb('shipping_address'),
    billingAddress: jsonb('billing_address'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_orders_user_id').on(table.userId),
    statusIdx: index('idx_orders_status').on(table.status),
    orderNumberIdx: index('idx_orders_number').on(table.orderNumber),
    createdAtIdx: index('idx_orders_created_at').on(table.createdAt),
    totalAmountIdx: index('idx_orders_total').on(table.totalAmount),
    userStatusIdx: index('idx_orders_user_status').on(table.userId, table.status),
  })
);


export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id').references(() => orders.id).notNull(),
    productId: integer('product_id').references(() => products.id).notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
    totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
    productSnapshot: jsonb('product_snapshot'), 
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    orderIdIdx: index('idx_order_items_order_id').on(table.orderId),
    productIdIdx: index('idx_order_items_product_id').on(table.productId),
    
    orderProductIdx: index('idx_order_items_order_product').on(table.orderId, table.productId),
  })
);


export const reviews = pgTable(
  'reviews',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id').references(() => products.id).notNull(),
    userId: integer('user_id').references(() => users.id).notNull(),
    orderId: integer('order_id').references(() => orders.id), 
    rating: integer('rating').notNull(), 
    title: varchar('title', { length: 255 }),
    content: text('content'),
    isVerifiedPurchase: boolean('is_verified_purchase').default(false),
    helpfulCount: integer('helpful_count').default(0),
    isApproved: boolean('is_approved').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    productIdIdx: index('idx_reviews_product_id').on(table.productId),
    userIdIdx: index('idx_reviews_user_id').on(table.userId),
    ratingIdx: index('idx_reviews_rating').on(table.rating),
    verifiedIdx: index('idx_reviews_verified').on(table.isVerifiedPurchase),
    approvedIdx: index('idx_reviews_approved').on(table.isApproved),
    createdAtIdx: index('idx_reviews_created_at').on(table.createdAt),
  })
);


export const userActivity = pgTable(
  'user_activity',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    sessionId: varchar('session_id', { length: 255 }),
    activityType: varchar('activity_type', { length: 50 }).notNull(), 
    entityType: varchar('entity_type', { length: 50 }), 
    entityId: integer('entity_id'),
    metadata: jsonb('metadata'), 
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_activity_user_id').on(table.userId),
    sessionIdx: index('idx_activity_session').on(table.sessionId),
    activityTypeIdx: index('idx_activity_type').on(table.activityType),
    entityIdx: index('idx_activity_entity').on(table.entityType, table.entityId),
    createdAtIdx: index('idx_activity_created_at').on(table.createdAt),
  })
);


export const searchQueries = pgTable(
  'search_queries',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    sessionId: varchar('session_id', { length: 255 }),
    query: varchar('query', { length: 500 }).notNull(),
    resultsCount: integer('results_count'),
    selectedResults: jsonb('selected_results'), 
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_search_user_id').on(table.userId),
    sessionIdx: index('idx_search_session').on(table.sessionId),
    queryIdx: index('idx_search_query').on(table.query),
    createdAtIdx: index('idx_search_created_at').on(table.createdAt),
  })
);


export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type UserActivity = typeof userActivity.$inferSelect;
export type NewUserActivity = typeof userActivity.$inferInsert;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type NewSearchQuery = typeof searchQueries.$inferInsert;