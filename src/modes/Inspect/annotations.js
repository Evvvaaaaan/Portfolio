// Inspect 투어 스텝. selector는 메인 페이지에 실존하는 요소여야 한다.
// 데스크톱 슬라이드 덱에서는 각 id의 첫 매치가 인플로우 스크롤 앵커(100vh)라
// 스크롤·하이라이트 모두 그 앵커 기준으로 동작한다.
export const ANNOTATIONS = [
  {
    selector: '#home',
    tag: '<section id="home">',
    title: 'Hero',
    note: 'The opening scene. The title is rendered as real 3D geometry with three.js, and the role line rotates through what I do. First impressions are a rendering problem.',
  },
  {
    selector: '.navbar',
    tag: '<header class="navbar">',
    title: 'Navbar',
    note: 'Sticky, translucent, and language-aware. The language switcher is a keyboard-accessible radiogroup — arrow keys work. The Mode menu you just used lives here too.',
  },
  {
    selector: '#about',
    tag: '<section id="about">',
    title: 'About',
    note: 'Copy lives in a four-language i18n dictionary (en/ko/ja/zh), not in the markup. Scroll-reveal animations are driven by a small IntersectionObserver hook, not a library.',
  },
  {
    selector: '#projects',
    tag: '<section id="projects">',
    title: 'Projects',
    note: 'A horizontally scrolling card rail. Each card carries its own accent color, and project data is a single source shared with the Terminal mode you can try from the menu.',
  },
  {
    selector: '#skills',
    tag: '<section id="skills">',
    title: 'Skills',
    note: 'The stack I actually ship with. Rendered as a plain list on purpose — content first, decoration second.',
  },
  {
    selector: '#contact',
    tag: '<section id="contact">',
    title: 'Contact',
    note: 'A real form, real validation, real inbox. If this tour convinced you, this is the section that matters.',
  },
]
