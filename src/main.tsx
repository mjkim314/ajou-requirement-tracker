import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/theme.css'
import { App } from './App'
import { AppStateProvider } from './app/AppState'
import { ErrorBoundary } from './app/ErrorBoundary'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </ErrorBoundary>
  </StrictMode>,
)
