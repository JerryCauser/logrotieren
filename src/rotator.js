import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import stream from 'node:stream'
import { EventEmitter } from 'node:events'
import {
  parseFrequency,
  isHighFrequency,
  validateBehavior,
  sanitizeValidateSize,
  sanitizeValidateFrequency,
  checkDirAccess
} from './helpers.js'
import {
  DEFAULT_FORMAT_NAME_FUNCTION,
  LOG_STATE_FILE_NAME,
  BEHAVIOR_COPY_COMPRESS_TRUNCATE,
  BEHAVIOR_COPY_TRUNCATE,
  BEHAVIOR_CREATE,
  EVENT_ROTATE,
  EVENT_READY, EVENT_ERROR
} from './constants.js'

/**
 * @param {object} options
 * @param {string} options.filePath
 * @param {string} options.dirPath
 * @param {string} options.frequency - 'hourly', 'daily', 'monthly'
 * @param {string} [options.encoding='utf8']
 * @param {string} [options.behavior='copy_truncate']
 * @param {string|number|null} [options.maxSize=null]
 * @param {number|null} [options.filesLimit]
 * @param {number|null} [options.maxAge]
 * @param {function} [options.formatName=DEFAULT_FORMAT_NAME_FUNCTION]
 * @param {string} [options.cwd=process.cwd()]
 * @param {string} [options.stateFileName='logstate.json']
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
  #maxSize
  #behavior

  #filesLimit
  #maxAge

  #formatName

  #compress = false
  #state = {
    lastRotationAt: null,
    lastNumber: null
  }

  #cwd
  #stateFileName

  #rotateTimeoutId
  #watcher

  constructor ({
    filePath,
    dirPath,
    frequency,
    encoding = 'utf8',
    behavior = BEHAVIOR_COPY_TRUNCATE,
    maxSize = null,
    filesLimit = null,
    maxAge = null,
    formatName = DEFAULT_FORMAT_NAME_FUNCTION,
    cwd = process.cwd(),
    stateFileName = LOG_STATE_FILE_NAME,
    ...other
  }) {
    super(other)

    validateBehavior(behavior)
    frequency = sanitizeValidateFrequency(frequency)
    maxSize = sanitizeValidateSize(maxSize)

    const { name, ext } = path.parse(filePath)
    this.#filePath = filePath
    this.#name = name
    this.#extension = ext.slice(1)
    this.#nameWithExtension = `${this.#name}.${this.#extension}`

    this.#dirPath = dirPath
    this.#encoding = encoding
    this.#frequency = frequency
    this.#maxSize = maxSize
    this.#behavior = behavior
    this.#filesLimit = filesLimit
    this.#maxAge = maxAge
    this.#formatName = DEFAULT_FORMAT_NAME_FUNCTION

    this.#compress = behavior === BEHAVIOR_COPY_COMPRESS_TRUNCATE

    this.#cwd = cwd
    this.#stateFileName = stateFileName
  }

  async #readState () {
    try {
      const fileBody = await fs.promises.readFile(
        path.resolve(this.#cwd, this.#stateFileName),
        { encoding: this.#encoding }
      )

      this.#state = JSON.parse(fileBody.toString(this.#encoding).trim())
      if (this.#state.lastRotationAt !== null) {
        this.#state.lastRotationAt = new Date(this.#state.lastRotationAt)
      }
      if (Array.isArray(this.#state.files) && this.#state.files.length > 0) {
        for (const file of this.#state.files) {
          file.createdAt = new Date(file.createdAt)
        }
      } else {
        this.#state.files = []
      }
    } catch {
      this.#state = {
        lastRotationAt: null,
        lastNumber: null,
        files: []
      }
    }
  }

  /**
   * @param {Date|string|number|Null} date
   * @param {number|Null} number
   * @returns {Promise<void>}
   */
  async #writeState (date = null, number = null) {
    this.#state.lastRotationAt = date === null ? date : new Date(date)
    this.#state.lastNumber = number

    await fs.promises.writeFile(
      path.resolve(this.#cwd, this.#stateFileName),
      JSON.stringify(this.#state, null, 2),
      { encoding: this.#encoding }
    )
  }

  async start () {
    await this.#readState()

    try {
      // TODO make listener for file creation. And start IDLE if file deleted
      await fs.promises.access(this.#filePath, fs.constants.R_OK | fs.constants.W_OK)
    } catch {
      const error = new Error('file_is_not_accessible')
      error.file = this.#filePath

      throw error
    }

    try {
      await checkDirAccess(this.#dirPath)
    } catch {
      await fs.promises.mkdir(this.#dirPath, { recursive: true })
      await checkDirAccess(this.#dirPath)
    }

    if (this.#maxSize) {
      this.#initWatcher()
    }

    if (this.#frequency) {
      await this.#scheduleRotate()
    }

    this.emit(EVENT_READY, this)

    return this
  }

  async #scheduleRotate () {
    const [prevRotation, nextRotation] = parseFrequency(this.#frequency)

    if (this.#state.lastRotationAt === null) {
      await this.#writeState(prevRotation, null)
    } else if (this.#state.lastRotationAt.getTime() <= prevRotation.getTime()) {
      process.nextTick(() => this.rotate())
    }

    const timeout = nextRotation.getTime() - Date.now()
    this.#rotateTimeoutId = setTimeout(() => this.#scheduleRotate(), timeout)
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
    try {
      await fs.promises.access(this.#filePath, fs.constants.R_OK | fs.constants.W_OK)
    } catch (e) {
      const error = new Error('file_is_not_accessible')
      error.file = this.#filePath
      error.ctx = e

      this.emit(EVENT_ERROR, error)

      return this
    }

    const number = this.#getNumber(date)

    const name = this.#formatName({
      name: this.#name,
      extension: this.#extension,
      date,
      number
    })

    const targetPath = path.resolve(this.#dirPath, name)

    try {
      await fs.promises.rm(targetPath)
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

    const fileInfo = { createdAt: date, number, name, path: targetPath }

    this.#state.files.push(fileInfo)
    await this.removeOldFiles()
    await this.#writeState(date, number)

    this.emit(EVENT_ROTATE, fileInfo)

    return this
  }

  /**
   * @param {Date} date
   * @returns {number|Null}
   */
  #getNumber (date) {
    let number = null

    if (isHighFrequency(this.#frequency) || this.#maxSize !== null) {
      if (this.#state.lastNumber === null) {
        number = 0
      } else {
        if (
          this.#state.lastRotationAt.getFullYear() === date.getFullYear() &&
          this.#state.lastRotationAt.getMonth() === date.getMonth() &&
          this.#state.lastRotationAt.getDate() === date.getDate()
        ) {
          number = this.#state.lastNumber + 1
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
    if (!this.#filesLimit || !this.#state.files?.length) return this

    const promises = []

    while (this.#state.files.length > this.#filesLimit) {
      const file = this.#state.files.shift()
      promises.push(fs.promises.rm(path.resolve(this.#dirPath, file.name)))
    }

    await Promise.allSettled(promises)

    return this
  }

  async removeOutdated () {
    if (!this.#maxAge || !this.#state.files?.length) return this

    const promises = []
    const dateNow = Date.now()

    for (let i = 0; i < this.#state.files.length; ++i) {
      const file = this.#state.files[i]
      if (file.createdAt.getTime() + this.#maxAge < dateNow) {
        promises.push(
          fs.promises
            .rm(path.resolve(this.#dirPath, file.name))
            .then(() => this.#state.files.splice(i, 1))
        )
      } else {
        // order of files in array is preserved and sorted by creation time
        break
      }
    }

    await Promise.allSettled(promises)

    return this
  }

  stop () {
    clearTimeout(this.#rotateTimeoutId)
    if (this.#watcher) this.#watcher.close()
  }
}

export default Rotator
