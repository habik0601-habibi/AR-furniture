import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Dev-only helper: /dev/posters renders every catalogue model in the browser
 * and POSTs a WebP snapshot here, which is saved to public/posters/<slug>.webp.
 * Listing pages then show a light image instead of loading every GLB.
 */
function posterSaver(): Plugin {
  return {
    name: 'roomsense-poster-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/poster', (req, res) => {
        const slug = new URL(req.url ?? '', 'http://x').searchParams.get('slug') ?? ''
        if (req.method !== 'POST' || !/^[a-z0-9-]{2,60}$/.test(slug)) {
          res.statusCode = 400
          return res.end('bad request')
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const dir = resolve(__dirname, 'public/posters')
          mkdirSync(dir, { recursive: true })
          writeFileSync(resolve(dir, `${slug}.webp`), Buffer.concat(chunks))
          res.end('ok')
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), posterSaver()],
  server: { host: true, port: 5180 },
})
