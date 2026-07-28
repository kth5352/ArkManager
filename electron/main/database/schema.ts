import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

export const explorerTabs = sqliteTable('explorer_tabs', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  path: text('path').notNull(),
  position: integer('position').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
})

export const sortPreferences = sqliteTable('sort_preferences', {
  page: text('page').primaryKey(),
  field: text('field').notNull(),
  direction: text('direction').notNull(),
})

export const gameMetadata = sqliteTable('game_metadata', {
  code: text('code').primaryKey(),
  title: text('title'),
  circle: text('circle'),
  releaseDate: text('release_date'),
  genres: text('genres'), // JSON 배열 문자열로 저장
  coverImagePath: text('cover_image_path'), // Task 3에서 채움, 지금은 항상 null
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const gameUserData = sqliteTable('game_user_data', {
  key: text('key').primaryKey(),
  keyType: text('key_type').notNull(), // 'code' | 'path'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
