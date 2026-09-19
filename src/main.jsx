import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// eslint-disable-next-line react-refresh/only-export-components -- The root entry mounts components; it is not a refresh boundary.
const SpatialStudio = lazy(() => import('./experiments/SpatialStudio/SpatialStudio.jsx'))

const isSpatialStudio = window.location.pathname === '/spatial'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isSpatialStudio ? <Suspense fallback={<p role="status">공간을 불러오는 중…</p>}><SpatialStudio /></Suspense> : <App />}
  </StrictMode>,
)
