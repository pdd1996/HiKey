import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme, getStoredTheme } from './lib/theme'
import './styles/globals.css'

// 渲染前同步应用主题，避免暗色用户首帧闪白（CSP 不允许内联脚本，故在此调用）。
applyTheme(getStoredTheme())

const root = document.getElementById('root')
if (!root) throw new Error('root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
