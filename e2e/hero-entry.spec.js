import { test, expect } from '@playwright/test'

async function recordFirstHeroFrame(page) {
  await page.addInitScript(() => {
    window.__firstHeroFrame = null
    const sample = () => {
      const hero = document.querySelector('section.hero')
      if (!hero) return requestAnimationFrame(sample)
      window.__firstHeroFrame = {
        awaiting: hero.classList.contains('hero--awaiting-arrival'),
        content: [...hero.querySelectorAll('.hero-content > *')].map((node) => ({
          opacity: getComputedStyle(node).opacity,
          animation: getComputedStyle(node).animationName,
        })),
        role: hero.querySelector('.role-text').textContent,
      }
    }
    requestAnimationFrame(sample)
  })
}

async function expectImmediateHero(page) {
  await page.waitForFunction(() => window.__firstHeroFrame !== null)
  const first = await page.evaluate(() => window.__firstHeroFrame)
  expect(first.awaiting).toBe(false)
  expect(first.content).toHaveLength(6)
  for (const item of first.content) {
    expect(item.opacity).toBe('1')
    expect(item.animation).toBe('none')
  }
  expect(first.role).toBe('Fullstack Engineer')
  await expect(page.locator('.hero-actions .btn-primary')).toBeVisible()
}

test('첫 프레임부터 내용을 표시하고 배경 연출 중에도 버튼이 동작한다', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await recordFirstHeroFrame(page)
  await page.goto('/', { waitUntil: 'commit' })
  await expectImmediateHero(page)
  await page.locator('.hero-actions .btn-primary').click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('같은 세션의 새로고침에도 내용을 즉시 표시한다', async ({ page }) => {
  await recordFirstHeroFrame(page)
  await page.goto('/', { waitUntil: 'commit' })
  await expectImmediateHero(page)
  await page.reload({ waitUntil: 'commit' })
  await expectImmediateHero(page)
})

for (const scenario of [
  { name: '모바일', options: { viewport: { width: 390, height: 844 }, isMobile: true } },
  { name: 'reduced-motion', options: { reducedMotion: 'reduce' } },
]) {
  test(`${scenario.name}에서도 첫 프레임부터 내용을 표시한다`, async ({ browser }) => {
    const context = await browser.newContext(scenario.options)
    try {
      const page = await context.newPage()
      await recordFirstHeroFrame(page)
      await page.goto('/', { waitUntil: 'commit' })
      await expectImmediateHero(page)
    } finally {
      await context.close()
    }
  })
}
