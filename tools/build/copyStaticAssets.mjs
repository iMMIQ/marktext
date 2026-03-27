import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..')
const sourceDir = path.join(rootDir, 'static')
const targetDir = path.join(rootDir, 'dist', 'electron', 'static')

await fs.mkdir(targetDir, { recursive: true })
await fs.cp(sourceDir, targetDir, { recursive: true })
