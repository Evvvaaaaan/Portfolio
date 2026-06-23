import { useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import './ProjectPage.css'

const projectData = {
  findx: {
    slug: 'findx',
    category: 'Mobile · Fullstack',
    title: 'FindX',
    tagline: '유실물을 보물로, 습득자를 헌터로 바꾸어 잃어버린 물건의 골든타임을 사수하는 게이미피케이션 하이퍼로컬 플랫폼',
    accent: '#4f9cf9',
    background: '분실물 발생 시 초기 1시간, 반경 500m 이내가 골든타임입니다. 하지만 경찰청 시스템은 등록에 3~5일이 소요되고, 기존 방식은 선의에만 의존해 회수율이 낮습니다. FindX는 보물찾기 게임 요소와 에스크로 보상을 결합해 이 문제를 해결합니다.',
    features: [
      {
        title: '비주얼 사진 마커',
        desc: '지도 위에 실물 썸네일을 직접 표시해 0.1초만에 유실물 식별 가능',
      },
      {
        title: '게이미피케이션 & 에스크로 안전 보상',
        desc: '퀘스트화된 미션, 포인트/XP 지급, 에스크로로 사례금을 안전하게 정산',
      },
      {
        title: 'AI 원터치 자동 등록',
        desc: '사진 한 장으로 AI가 카테고리·특징 자동 분석, 등록 시간 70% 단축',
      },
      {
        title: '실시간 1:1 안전 채팅',
        desc: '개인정보 노출 없이 반환 장소를 조율하는 보호된 채팅',
      },
    ],
    stack: ['React Native', 'Styled-components', 'Spring Boot', 'WebSocket', 'AWS', 'Figma', 'Claude Code/MCP'],
    role: {
      title: '프로젝트 총괄 리드(대표) · Full-stack · UI/UX 디자인',
      bullets: [
        'LBS 비주얼 마커 렌더링 구조 설계 및 구현',
        '바텀시트 인터랙션 개발',
        'Full-stack 개발 총괄',
        'UI/UX 디자인',
      ],
    },
    results: [
      'Apple App Store 정식 출시 (Ready for Sale)',
      '교내 SW 페스티벌 우수상',
      '공학적 문제해결 프로젝트 선정 (지원금 200만원)',
      'CBT 성공 완료',
    ],
    links: [
      { label: 'App Store', href: 'https://apps.apple.com/kr/app/find-x/id6758507153?l=en-GB', external: true },
      { label: 'GitHub', href: 'https://github.com/Evvvaaaaan/treasureHunter-frontend', external: true },
    ],
  },

  spotline: {
    slug: 'spotline',
    category: 'Fullstack',
    title: 'Spotline',
    tagline: '추후 업데이트 예정',
    accent: '#f59e0b',
    comingSoon: true,
  },

  lyralab: {
    slug: 'lyralab',
    category: 'Studio · Fullstack',
    title: 'Lyralab',
    tagline: '일상에서 발견한 문제와 아이디어를 소프트웨어로 개발하는 프로젝트 스튜디오',
    accent: '#a855f7',
    background: '일상 속 문제 및 아이디어를 자유롭게 개발하여 사람들에게 알리는 플랫폼입니다. 작은 아이디어가 실제 서비스가 되는 과정을 빠르게 실험합니다.',
    features: [
      {
        title: 'ColorVote',
        desc: '자신의 선호 색상을 조사해 전국 사람들과 비교, 지도별/연령별 통계 시각화',
        link: 'https://lyralab.site/colorvote',
      },
      {
        title: '나는 10의 남-여자인가?',
        desc: '설문으로 전국 순위를 파악, 5가지 분야별 질문으로 결과 확인',
        link: 'https://lyralab.site/percentme',
      },
    ],
    stack: ['React', 'Supabase', 'Claude', 'Codex', 'Gemini', 'Figma', 'Claude design'],
    role: {
      title: 'AI 아키텍처 설계 · 풀스택 개발 · 기획 · 마케팅',
      bullets: [
        'AI 아키텍처 설계',
        '풀스택 개발',
        '서비스 기획',
        '마케팅',
      ],
    },
    results: [
      '현재 서비스 운영 중',
      '런칭 하루 1000명 이상 사용자 유치',
    ],
    links: [
      { label: 'ColorVote', href: 'https://lyralab.site/colorvote', external: true },
      { label: '나는 10의 남-여자인가?', href: 'https://lyralab.site/percentme', external: true },
    ],
  },
}

export default function ProjectPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const data = projectData[slug]

  useEffect(() => { window.scrollTo(0, 0) }, [])

  const goBack = () => navigate(-1)

  if (!data) {
    return (
      <div className="ppage-notfound">
        <p>프로젝트를 찾을 수 없습니다.</p>
        <button onClick={goBack} className="ppage-back">← 돌아가기</button>
      </div>
    )
  }

  if (data.comingSoon) {
    return (
      <div className="ppage" style={{ '--card-accent': data.accent }}>
        <div className="ppage-inner">
          <button onClick={goBack} className="ppage-back">← Back to Projects</button>
          <div className="ppage-coming-soon">
            <span className="ppage-badge">{data.category}</span>
            <h1 className="ppage-title">{data.title}</h1>
            <p className="ppage-coming-msg">자세한 내용은 곧 업데이트됩니다.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ppage" style={{ '--card-accent': data.accent }}>
      <div className="ppage-inner">
        <Link to="/#projects" className="ppage-back">← Back to Projects</Link>

        {/* Hero */}
        <header className="ppage-hero">
          <span className="ppage-badge">{data.category}</span>
          <h1 className="ppage-title">{data.title}</h1>
          <p className="ppage-tagline">{data.tagline}</p>
        </header>

        {/* Background */}
        {data.background && (
          <section className="ppage-section">
            <p className="ppage-section-label">Background</p>
            <p className="ppage-body">{data.background}</p>
          </section>
        )}

        {/* Features */}
        {data.features && data.features.length > 0 && (
          <section className="ppage-section">
            <p className="ppage-section-label">
              {data.slug === 'lyralab' ? 'Sub-projects' : 'Features'}
            </p>
            <div className="ppage-features">
              {data.features.map((f, i) => (
                <div key={i} className="ppage-feature-card">
                  <div className="ppage-feature-num">0{i + 1}</div>
                  <div>
                    {f.link ? (
                      <a
                        href={f.link}
                        target="_blank"
                        rel="noreferrer"
                        className="ppage-feature-title ppage-feature-link"
                      >
                        {f.title}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </a>
                    ) : (
                      <p className="ppage-feature-title">{f.title}</p>
                    )}
                    <p className="ppage-feature-desc">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Stack */}
        {data.stack && data.stack.length > 0 && (
          <section className="ppage-section">
            <p className="ppage-section-label">Tech Stack</p>
            <ul className="ppage-tags">
              {data.stack.map((t) => (
                <li key={t} className="ppage-tag">{t}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Role */}
        {data.role && (
          <section className="ppage-section">
            <p className="ppage-section-label">My Role</p>
            <p className="ppage-role-title">{data.role.title}</p>
            <ul className="ppage-bullets">
              {data.role.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Results */}
        {data.results && data.results.length > 0 && (
          <section className="ppage-section">
            <p className="ppage-section-label">Results</p>
            <ul className="ppage-results">
              {data.results.map((r, i) => (
                <li key={i} className="ppage-result-item">
                  <span className="ppage-result-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Links */}
        {data.links && data.links.length > 0 && (
          <section className="ppage-section ppage-links-section">
            <p className="ppage-section-label">Links</p>
            <div className="ppage-links">
              {data.links.map((l, i) => (
                <a
                  key={i}
                  href={l.href}
                  target={l.external ? '_blank' : undefined}
                  rel={l.external ? 'noreferrer' : undefined}
                  className={`ppage-link-btn${i === 0 ? ' primary' : ''}`}
                >
                  {l.label}
                  {l.external && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
