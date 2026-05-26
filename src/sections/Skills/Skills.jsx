import { useLang } from '../../context/LangContext'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './Skills.css'

const skillGroups = [
  {
    category: 'Frontend',
    icon: '🎨',
    skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'JavaScript', 'HTML / CSS'],
  },
  {
    category: 'Backend',
    icon: '⚙️',
    skills: ['Node.js', 'Express', 'Python', 'Django', 'REST API', 'PostgreSQL'],
  },
  {
    category: 'Tools & DevOps',
    icon: '🛠️',
    skills: ['Git / GitHub', 'Docker', 'Nginx', 'Linux', 'Vite', 'CI/CD'],
  },
  {
    category: 'Design',
    icon: '✦',
    skills: ['Figma', 'UI Systems', 'Responsive Design', 'Accessibility', 'Web Perf', 'Three.js'],
  },
]

export default function Skills() {
  const ref = useScrollReveal()
  const { t } = useLang()

  return (
    <section className="skills section" id="skills" ref={ref}>
      <div className="container">
        <div className="section-header">
          <p className="section-label fade-up">{t.skills.label}</p>
          <h2 className="section-title fade-up delay-1">{t.skills.title}</h2>
          <p className="section-sub fade-up delay-2">{t.skills.sub}</p>
        </div>

        <div className="skills-grid">
          {skillGroups.map((group, gi) => (
            <div key={group.category} className={`skill-card fade-up delay-${gi + 1}`}>
              <div className="skill-card-header">
                <span className="skill-icon" aria-hidden="true">{group.icon}</span>
                <h3 className="skill-category">{group.category}</h3>
              </div>
              <ul className="skill-list">
                {group.skills.map((skill) => (
                  <li key={skill} className="skill-item">
                    <span className="skill-dot" aria-hidden="true" />
                    {skill}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
