import path from 'node:path'
import fs from 'node:fs'
import EventEmitter from 'node:events'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const logStateFileName = 'logstate.json'

export const DEFAULT_FORMAT_NAME_FUNCTION = ({ name, extension, date, number }) => {
  name ??= '.'

  if (date !== undefined && date !== null) {
    date = new Date(date)
    const y = date.getFullYear()
    const m = (date.getMonth() + 1).toString().padStart(2, '0')
    const d = date.getDate().toString().padStart(2, '0')

    name += `${y}-${m}-${d}.`
  }

  if (number !== null && number !== undefined) {
    name += `${number}.`
  }

  if (extension !== null && extension !== undefined) {
    name += extension
  } else {
    name = name.slice(0, name.length - 1)
  }

  return name
}

class Rotator extends EventEmitter {
  #filePath
  #name
  #extension

  #dirPath
  #encoding

  #frequency
  #behavior

  #maxSize
  #maxFiles
  #maxAge

  #compress

  #formatName

  #state = {
    lastDate: null,
    lastNumber: null
  }

  constructor ({
    filePath,
    dirPath,
    encoding = 'utf8',
    frequency,
    behavior = 'copy',
    maxSize = null,
    maxFiles = null,
    maxAge = null,
    compress = false,
    formatName = DEFAULT_FORMAT_NAME_FUNCTION
  }) {
    super()

    this.#filePath = filePath
    this.#dirPath = dirPath
    this.#encoding = encoding
    this.#frequency = frequency
    this.#behavior = behavior
    this.#maxSize = maxSize
    this.#maxFiles = maxFiles
    this.#maxAge = maxAge
    this.#compress = compress
    this.#formatName = formatName

    this.#parseFilePath()
  }

  #parseFilePath () {
    const { name, ext } = path.parse(this.#filePath)
    this.#name = name
    this.#extension = ext.slice(1)
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
    this.#state.lastDate = date === null ? date : new Date(date).toISOString()
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

  async rotate (date = new Date()) {
    const number = this.#getSizeNameNumber()

    const name = this.#formatName({
      name: this.#name,
      extension: this.#extension,
      date,
      number
    })

    switch (this.#behavior) {
      case 'copytruncate': {
        await fs.promises.copyFile(this.#filePath, path.resolve(this.#dirPath, name))
        await fs.promises.truncate(this.#filePath, 0)
        break
      }
      case 'create': {
        await fs.promises.rename(this.#filePath, path.resolve(this.#dirPath, name))
        await fs.promises.writeFile(this.#filePath, '', { encoding: this.#encoding })
        break
      }
    }

    await this.#writeState(date, number)

    this.removeOldFiles().catch(e => console.error(e))

    return this
  }

  #getSizeNameNumber () {
    let number = null

    if (this.#maxSize !== null) {
      if (this.#state.lastDate === null) {
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
    if (!this.#maxFiles) {
      await this.removeSurplus()
    }

    if (!this.#maxAge) {
      await this.removeOutdated()
    }
  }

  async removeSurplus () {
    // todo
    return this
  }

  async removeOutdated () {
    // todo
    return this
  }

  stop () {

  }
}

export default Rotator
