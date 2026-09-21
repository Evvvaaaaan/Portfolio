import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/experiments/MidnightDispatch/*.test.js'], environment: 'node' },
})
