import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { Spinner } from './components/ui'

const Landing = lazy(() => import('./pages/Landing'))
const DemoShop = lazy(() => import('./pages/demo/DemoShop'))
const Embed = lazy(() => import('./pages/embed/Embed'))
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'))
const NotFound = lazy(() => import('./pages/NotFound'))
const DevPosters = lazy(() => import('./pages/DevPosters'))

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center text-ink-2">
      <Spinner />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/demo/:store" element={<DemoShop />} />
          <Route path="/demo/:store/:product" element={<DemoShop />} />
          <Route path="/embed/:store/:product" element={<Embed />} />
          <Route path="/dashboard/*" element={<Dashboard />} />
          {import.meta.env.DEV && <Route path="/dev/posters" element={<DevPosters />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
