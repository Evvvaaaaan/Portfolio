import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.js', 'dev/**/*.test.js'],
    environment: 'node',
  },
})
