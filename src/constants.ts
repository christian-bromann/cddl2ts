import fs from 'node:fs/promises'
import url from 'node:url'
import path from 'node:path'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
export const pkg = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf-8'))
