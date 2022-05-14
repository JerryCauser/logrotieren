import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import stream from 'node:stream'
import { EventEmitter } from 'node:events'
import {
  parseFrequency,
  isHighFrequency,
  readFileStats,
  validateBehavior,
  sanitizeValidateSize,
  validateFrequency
} from './helpers.js'
import {
  DEFAULT_FORMAT_NAME_FUNCTION,
  LOG_STATE_FILE_NAME,
  BEHAVIOR_COPY_COMPRESS_TRUNCATE,
  BEHAVIOR_COPY_TRUNCATE,
  BEHAVIOR_CREATE,
  EVENT_ERROR,
  EVENT_ROTATE,
  EVENT_READY
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
 // * @param {function} [options.formatName=DEFAULT_FORMAT_NAME_FUNCTION]
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
    // formatName = DEFAULT_FORMAT_NAME_FUNCTION, // TODO when rotator starts removing files based on state file then unccomment
    cwd = process.cwd(),
    stateFileName = LOG_STATE_FILE_NAME,
    ...other
  }) {
    super(other)

    validateBehavior(behavior)
    validateFrequency(frequency) // TODO it is optional
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
    } catch {
      this.#state = {
        lastRotationAt: null,
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
      await fs.promises.access(this.#filePath, fs.constants.R_OK)
    } catch {
      const error = new Error('file_is_not_readable')
      error.file = this.#filePath

      throw error
    }

    try {
      // TODO try to create file if it not exists
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
    // TODO check if file to rotate exists?
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

    await this.#writeState(date, number)
    await this.removeOldFiles()

    this.emit(EVENT_ROTATE, { date, number, name, path: targetPath })

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
    if (!this.#filesLimit) return this

    const files = await this.#readDir()

    const promises = []

    while (files.length > this.#filesLimit) {
      const file = files.pop()
      promises.push(fs.promises.rm(path.resolve(this.#dirPath, file.name)))
    }

    await Promise.allSettled(promises)

    return this
  }

  async removeOutdated () {
    if (!this.#maxAge) return this

    const files = await this.#readDir()

    const promises = []
    const dateNow = Date.now()

    for (const file of files) {
      if (file.birthtimeMs + this.#maxAge < dateNow) {
        promises.push(fs.promises.rm(path.resolve(this.#dirPath, file.name)))
      }
    }

    await Promise.allSettled(promises)

    return this
  }

  async #readDir () {
    const dir = await fs.promises.readdir(this.#dirPath, {
      encoding: this.#encoding
    })

    let files = []
    // todo read files from state file
    for (const fileName of dir) {
      if (
        fileName !== this.#nameWithExtension &&
        fileName.includes(this.#name)
      ) {
        files.push(readFileStats(this.#dirPath, fileName))
      }
    }

    files = (await Promise.allSettled(files))
      .reduce((acc, res) => {
        if (res.reason) {
          const error = new Error(res.reason?.toString())
          error.ctx = res.reason

          this.emit(EVENT_ERROR, error)
        } else {
          if (res.value !== undefined && res.value.isFile()) {
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
