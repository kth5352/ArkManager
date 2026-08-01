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
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  isCleared: integer('is_cleared', { mode: 'boolean' }).notNull().default(false),
  rating: integer('rating'), // 1-5, null이면 미평가
  memo: text('memo'),
  launchConfig: text('launch_config'), // JSON: { executablePath, launchMode }
  totalPlaytimeMs: integer('total_playtime_ms').notNull().default(0),
  lastPlayedAt: text('last_played_at'),
  savePath: text('save_path'),
  customCoverPath: text('custom_cover_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const pathCodeOverrides = sqliteTable('path_code_overrides', {
  path: text('path').primaryKey(), // normalized via normalizeLibraryPath
  code: text('code').notNull(),
  createdAt: text('created_at').notNull(),
})
