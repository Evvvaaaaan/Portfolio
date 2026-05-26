import './index.css'
import { LangProvider } from './context/LangContext'
import Cursor from './components/Cursor/Cursor'
import Navbar from './components/Navbar/Navbar'
import SpaceBackground from './components/SpaceBackground/SpaceBackground'
import Hero from './sections/Hero/Hero'
import About from './sections/About/About'
import Projects from './sections/Projects/Projects'
import Skills from './sections/Skills/Skills'
import Contact from './sections/Contact/Contact'
import Footer from './components/Footer/Footer'
import LoadingShowcase from './components/LoadingShowcase/LoadingShowcase'

const isShowcase = new URLSearchParams(window.location.search).get('showcase') === 'loading'

function App() {
  if (isShowcase) return <LoadingShowcase />

  return (
    <LangProvider>
      <SpaceBackground />
      <Cursor />
      <Navbar />
      <main>
        <Hero />
        <About />
        <Skills />
        <Projects />
        <Contact />
      </main>
      <Footer />
    </LangProvider>
  )
}

export default App
