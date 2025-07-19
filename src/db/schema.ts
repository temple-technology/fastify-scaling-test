
import { 
  pgTable, 
  serial, 
  integer, 
  text
} from 'drizzle-orm/pg-core';

export const world = pgTable('world', {
  id: serial('id').primaryKey(),
  randomNumber: integer('randomNumber').notNull(),
});

export const fortune = pgTable('fortune', {
  id: serial('id').primaryKey(),
  message: text('message').notNull(),
});

export type World = typeof world.$inferSelect;
export type NewWorld = typeof world.$inferInsert;
export type Fortune = typeof fortune.$inferSelect;
export type NewFortune = typeof fortune.$inferInsert;