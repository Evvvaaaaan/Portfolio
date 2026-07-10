import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ModeContext = createContext(null)

export function ModeProvider({ children }) {
  const [modeId, setModeId] = useState(null)
  const exitMode = useCallback(() => setModeId(null), [])
  const value = useMemo(() => ({ modeId, setModeId, exitMode }), [modeId, exitMode])
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode() {
  return useContext(ModeContext)
}
