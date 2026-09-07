// 사이트 메뉴(버거 오버레이)를 연다.
//
// 상단 바에는 로고와 버거만 있다 — 섹션 링크와 사이트 컨트롤(모드·언어·소리·
// 오토파일럿)은 전부 이 오버레이 안에 있으므로, 그것들을 만지는 스펙은 먼저
// 메뉴를 열어야 한다. 파일명이 *.spec.js가 아니므로 Playwright가 테스트로
// 수집하지 않는다.
export async function openSiteMenu(page) {
  await page.locator('.nav-burger').click()
  await page.locator('.nav-mobile').waitFor({ state: 'visible' })
}
