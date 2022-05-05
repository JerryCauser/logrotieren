import fs from 'node:fs'
import url from 'node:url'
import path from 'node:path'
import zlib from 'node:zlib'
import stream from 'node:stream'
import { EventEmitter } from 'node:events'
import {
  DEFAULT_FORMAT_NAME_FUNCTION,
  parseFrequency,
  isLowFrequency,
  readFileStats,
  validateBehavior,
  sanitizeValidateSize
} from './helpers.js'
import {
  BEHAVIOR_COPY_COMPRESS_TRUNCATE,
  BEHAVIOR_COPY_TRUNCATE,
  BEHAVIOR_CREATE,
  EVENT_ERROR,
  EVENT_ROTATE,
  EVENT_PREROTATE,
  EVENT_READY
} from './constants.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const logStateFileName = 'logstate.json'

/**
 * @param {object} options
 * @param {string} options.filePath
 * @param {string} options.dirPath
 * @param {string} [options.encoding='utf8']
 * @param {string} options.frequency - 'hourly', 'daily', 'monthly'
 * @param {string} [options.behavior='copy_truncate']
 * @param {string|number|null} [options.maxSize=null]
 * @param {number|null} [options.maxFiles]
 * @param {number|null} [options.maxAge]
 * @param {function} [options.formatName=DEFAULT_FORMAT_NAME_FUNCTION]
 * @constructor
 */
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

  #compress = false
  #state = {
    lastDate: null,
    lastNumber: null
  }

  #rotateTimeoutId
  #watcher

  constructor ({
    filePath,
    dirPath,
    encoding = 'utf8',
    frequency,
    behavior = BEHAVIOR_COPY_TRUNCATE,
    maxSize = null,
    maxFiles = null,
    maxAge = null,
    formatName = DEFAULT_FORMAT_NAME_FUNCTION,
    ...other
  }) {
    super(other)

    validateBehavior(behavior)
    validateBehavior(frequency)
    maxSize = sanitizeValidateSize(maxSize)

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

    this.#compress = behavior === BEHAVIOR_COPY_COMPRESS_TRUNCATE
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
      await fs.promises.access(
        this.#dirPath,
        fs.constants.R_OK | fs.constants.W_OK
      )
    } catch {
      const error = new Error('dir_is_not_accessible')
      error.file = this.#dirPath

      throw error
    }

    if (this.#maxSize) {
      this.#initWatcher()
    }

    this.emit(EVENT_READY, this)

    await this.#scheduleRotate()

    return this
  }

  async #scheduleRotate () {
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

  #initWatcher () {
    this.#watcher = fs.watch(this.#filePath, this.#watchSizeHandler)
  }

  /**
   * @param {'close'|'rename'|'change'} event
   * @returns {Promise<void>}
   */
  #watchSizeHandler = async (event) => {
    switch (event) {
      case 'rename': {
        this.#watcher.close()
        this.#initWatcher()
        break
      }
      case 'change': {
        const stat = await fs.promises.stat(this.#filePath)
        if (stat.size >= this.#maxSize) {
          await this.rotate()
        }
        break
      }
    }
  }

  /**
   * @param {Date} [date]
   * @returns {Promise<Rotator>}
   */
  async rotate (date = new Date()) {
    const number = this.#getNumber(date)

    const name = this.#formatName({
      name: this.#name,
      extension: this.#extension,
      date,
      number
    })

    this.emit(EVENT_PREROTATE, { date, number, name })

    const targetPath = path.resolve(this.#dirPath, name)

    try {
      await fs.promises.unlink(targetPath)
    } catch {}

    switch (this.#behavior) {
      case BEHAVIOR_CREATE: {
        await fs.promises.rename(this.#filePath, targetPath)
        await fs.promises.writeFile(this.#filePath, '', {
          encoding: this.#encoding
        })
        break
      }
      case BEHAVIOR_COPY_TRUNCATE: {
        await fs.promises.copyFile(this.#filePath, targetPath)
        await fs.promises.truncate(this.#filePath, 0)
        break
      }
      case BEHAVIOR_COPY_COMPRESS_TRUNCATE: {
        await stream.promises.pipeline(
          fs.createReadStream(this.#filePath, { encoding: this.#encoding }),
          zlib.createGzip(),
          fs.createWriteStream(targetPath, { encoding: this.#encoding })
        )
        await fs.promises.truncate(this.#filePath, 0)
        break
      }
    }

    await this.#writeState(date, number)
    await this.removeOldFiles()

    this.emit(EVENT_ROTATE, { date, number, name })

    return this
  }

  /**
   * @param {Date} date
   * @returns {number|Null}
   */
  #getNumber (date) {
    let number = null

    if (isLowFrequency(this.#frequency) || this.#maxSize !== null) {
      if (this.#state.lastNumber === null) {
        number = 0
      } else {
        if (
          this.#state.lastDate.getFullYear() === date.getFullYear() &&
          this.#state.lastDate.getMonth() === date.getMonth() &&
          this.#state.lastDate.getDate() === date.getDate()
        ) {
          number = this.#state + 1
        } else {
          number = 0
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

      while (files.length > this.#maxFiles) {
        const file = files.pop()
        promises.push(
          fs.promises.unlink(path.resolve(this.#dirPath, file.name))
        )
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
          promises.push(
            fs.promises.unlink(path.resolve(this.#dirPath, file.name))
          )
        }
      }

      await Promise.allSettled(promises)
    }

    return this
  }

  async #readDir () {
    const dir = await fs.promises.readdir(this.#dirPath, {
      encoding: this.#encoding
    })

    let files = []

    for (const fileName of dir) {
      files.push(readFileStats(this.#dirPath, fileName))
    }

    files = (await Promise.allSettled(files))
      .reduce((acc, res) => {
        if (res.reason) {
          const error = new Error(res.reason?.toString())
          error.ctx = res.reason

          this.emit(EVENT_ERROR, error)
        } else {
          if (
            res.value !== undefined &&
            res.value.isFile() &&
            res.value.name !== this.#nameWithExtension &&
            res.value.name.includes(this.#name)
          ) {
            acc.push(res.value)
          }
        }

        return acc
      }, [])
      // includes(#name) need for filter "not our" files (for example when different logs are located at same directory
      .sort((a, b) => b.birthtimeMs - a.birthtimeMs) // old at the end of array

    return files
  }

  stop () {
    clearTimeout(this.#rotateTimeoutId)
    if (this.#watcher) this.#watcher.close()
  }
}

export default Rotator
