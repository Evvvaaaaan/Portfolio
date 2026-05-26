import { createContext, useContext, useEffect, useState } from 'react'
import { translations } from '../i18n/translations'

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLang] = useState('en')

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <LangContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
