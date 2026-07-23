import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 앱(dev/build)용 설정. 테스트는 vitest.config.ts를 별도로 쓴다
// (node 환경 유지 → 엔진 테스트가 React/Tailwind 플러그인의 영향을 받지 않음).
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
