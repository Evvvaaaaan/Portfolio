import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.js'],
    environment: 'node',
  },
})
