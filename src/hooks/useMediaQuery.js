import { useEffect, useState } from 'react'

// 데스크톱 슬라이드덱/스테이지 게이트가 쓰는 미디어쿼리를 여러 컴포넌트가
// 공유한다 — 조건 문자열이 갈라지면 스테이지는 켜졌는데 UI는 안 뜨는 식으로
// 조용히 어긋난다.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = () => setMatches(media.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}
