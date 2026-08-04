import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // 이 스위트는 거의 모든 스펙이 WebGL 씬을 띄우고, CI/헤드리스에서는 소프트웨어
  // 렌더링으로 돌아 CPU를 통째로 쓴다. 워커를 늘리면 서로 CPU를 뺏어 마운트가
  // 10초를 넘기거나 타이밍이 뒤집히는 가짜 실패가 난다 (실측: 병렬에서 arrival
  // 스펙이 section.hero를 10초 안에 못 찾음, 직렬에서는 6.8초에 통과).
  workers: 1,
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
