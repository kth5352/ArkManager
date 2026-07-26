import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './electron/main/database/schema.ts',
  out: './drizzle',
})
