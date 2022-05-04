import fs from 'node:fs'
import url from 'node:url'
import path from 'node:path'
import zlib from 'node:zlib'
import stream from 'node:stream'
import { EventEmitter } from 'node:events'
import { parseFrequency, readFileStats, DEFAULT_FORMAT_NAME_FUNCTION } from './helpers.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const logStateFileName = 'logstate.json'

class Rotator extends EventEmitter {
  #filePath
  #name
  #extension
  #nameWithExtension

  #dirPath
  #encoding

  #frequency
  #behavior

  #maxSize
  #maxFiles
  #maxAge

  #formatName

  #state = {
    lastDate: null,
    lastNumber: null
  }

  #rotateTimeoutId

  constructor ({
    filePath,
    dirPath,
    encoding = 'utf8',
    frequency,
    behavior = 'copy',
    maxSize = null,
    maxFiles = null,
    maxAge = null,
    formatName = DEFAULT_FORMAT_NAME_FUNCTION
  }) {
    super()

    const { name, ext } = path.parse(filePath)
    this.#filePath = filePath
    this.#name = name
    this.#extension = ext.slice(1)
    this.#nameWithExtension = `${this.#name}.${this.#extension}`

    this.#dirPath = dirPath
    this.#encoding = encoding
    this.#frequency = frequency
    this.#behavior = behavior
    this.#maxSize = maxSize
    this.#maxFiles = maxFiles
    this.#maxAge = maxAge
    this.#formatName = formatName
  }

  async #readState () {
    const fileBody = await fs.promises.readFile(
      path.resolve(__dirname, logStateFileName),
      { encoding: this.#encoding }
    )

    try {
      this.#state = JSON.parse(fileBody.toString(this.#encoding).trim())
      if (this.#state.lastDate !== null) {
        this.#state.lastDate = new Date(this.#state.lastDate)
      }
    } catch {
      this.#state = {
        lastDate: null,
        lastNumber: null
      }
    }
  }

  /**
   * @param {Date|string|number|Null} date
   * @param {number|Null} number
   * @returns {Promise<void>}
   */
  async #writeState (date = null, number = null) {
    this.#state.lastDate = date === null ? date : new Date(date)
    this.#state.lastNumber = number

    await fs.promises.writeFile(
      path.resolve(__dirname, logStateFileName),
      JSON.stringify(this.#state, null, 2),
      { encoding: this.#encoding }
    )
  }

  async start () {
    await this.#readState()

    try {
      await fs.promises.access(this.#filePath, fs.constants.R_OK)
    } catch {
      const error = new Error('file_is_not_readable')
      error.file = this.#filePath

      throw error
    }

    try {
      await fs.promises.access(this.#dirPath, fs.constants.R_OK | fs.constants.W_OK)
    } catch {
      const error = new Error('dir_is_not_accessible')
      error.file = this.#dirPath

      throw error
    }

    if (this.#maxSize) {
      // todo start watcher
    }

    return this
  }

  async #scheduleRotate () { // todo
    const [prev, next] = parseFrequency(this.#frequency)

    if (this.#state.lastDate === null) {
      await this.#writeState(prev, null)
    }

    if (this.#state.lastDate.getTime() === prev.getTime()) {
      const timeout = next.getTime() - Date.now()

      this.#rotateTimeoutId = setTimeout(() => this.#scheduleRotate(), timeout)
    } else if (this.#state.lastDate.getTime() <= prev.getTime()) {
      await this.rotate()
    }
  }

  async rotate (date = new Date()) {
    const number = this.#getNumber(date)

    const name = this.#formatName({
      name: this.#name,
      extension: this.#extension,
      date,
      number
    })

    const targetPath = path.resolve(this.#dirPath, name)

    switch (this.#behavior) {
      case 'create': {
        await fs.promises.rename(this.#filePath, targetPath)
        await fs.promises.writeFile(this.#filePath, '', { encoding: this.#encoding })
        break
      }
      case 'copy_truncate': {
        await fs.promises.copyFile(this.#filePath, targetPath)
        await fs.promises.truncate(this.#filePath, 0)
        break
      }
      case 'copy_compress_truncate': {
        await stream.promises.pipeline(
          fs.createReadStream(this.#filePath, { encoding: this.#encoding }),
          zlib.createGzip(),
          fs.createWriteStream(targetPath, { encoding: this.#encoding })
        )
        break
      }
      default: {
        throw new Error('behavior_not_recognized')
      }
    }

    await this.#writeState(date, number)
    await this.removeOldFiles()

    return this
  }

  #getNumber (date) {
    let number = null
    const isUsable = this.#maxSize !== null || ['hourly', '10s'].includes(this.#frequency)

    if (isUsable) {
      if (this.#state.lastNumber === null) {
        number = 0
      } else {
        if (this.#state.lastDate.toISOString().slice(0, 10) !== date.toISOString().slice(0, 10)) {
          number = 0
        } else {
          number = this.#state + 1
        }
      }
    }

    return number
  }

  async removeOldFiles () {
    await this.removeSurplus()
    await this.removeOutdated()
  }

  async removeSurplus () {
    if (!this.#maxFiles) {
      const files = await this.#readDir()

      const promises = []

      while (files.length > this.#maxSize) {
        const file = files.pop()
        promises.push(fs.promises.unlink(path.resolve(this.#dirPath, file.name)))
      }

      await Promise.allSettled(promises)
    }

    return this
  }

  async removeOutdated () {
    if (!this.#maxAge) {
      const files = await this.#readDir()

      const promises = []
      const dateNow = Date.now()

      for (const file of files) {
        if (file.birthtimeMs + this.#maxAge < dateNow) {
          promises.push(fs.promises.unlink(path.resolve(this.#dirPath, file.name)))
        }
      }

      await Promise.allSettled(promises)
    }

    return this
  }

  async #readDir () {
    const dir = await fs.promises.readdir(this.#dirPath, { encoding: this.#encoding })

    let files = []

    for (const fileName of dir) {
      files.push(readFileStats(this.#dirPath, fileName))
    }

    files = (await Promise.all(files))
      .filter(file => file.isFile() && file.name !== this.#nameWithExtension && file.name.includes(this.#name))
      // includes(#name) need for filter "not our" files (for example when different logs are located at same directory
      .sort((a, b) => b.birthtimeMs - a.birthtimeMs) // old at the end of array

    return files
  }

  stop () {
    clearTimeout(this.#rotateTimeoutId)
  }
}

export default Rotator
