import url from 'node:url'
import path from 'node:path'
import Rotator, { constants } from '../index.js'
import _main from './_main.js'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

_main({
  __dirname,
  Rotator,
  constants
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
