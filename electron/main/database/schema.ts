import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  createdAt: text('created_at').notNull(),
})
