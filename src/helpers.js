import fs from 'node:fs'
import path from 'node:path'
import {
  BEHAVIOR_LIST,
  FREQUENCY_LIST,
  FREQUENCY_MONTHLY,
  FREQUENCY_DAILY,
  FREQUENCY_HOURLY,
  FREQUENCY_10S
} from 'src/constants.js'

/**
 * @param {string} behavior
 */
export function validateBehavior (behavior) {
  if (BEHAVIOR_LIST.includes(behavior)) {
    return
  }

  const error = new Error('behavior_not_recognized')
  error.ctx = { behavior }

  throw error
}

/**
 * @param {string|number|Null|undefined} maxSize
 * @returns {number|Null}
 */
export function sanitizeValidateSize (maxSize) {
  if (maxSize === null || maxSize === undefined) {
    return null
  }

  if (typeof maxSize === 'number') {
    return maxSize > 0 ? maxSize : null
  }

  if (typeof maxSize === 'string') {
    let [, size, postfix] = maxSize.match(/(\d+)\s?([a-z])?/i) || []

    if (size !== undefined) {
      size = parseInt(size, 10)

      if (size <= 0) return null

      if (postfix !== undefined) {
        switch (postfix.toLowerCase()) {
          case 'k':
            return size * 2 ** 10
          case 'm':
            return size * 2 ** 20
          case 'g':
            return size * 2 ** 30
        }
      }
    }
  }

  const error = new Error('max_size_not_valid')
  error.ctx = { maxSize }

  throw error
}

/**
 * @param {string} frequency
 */
export function validateFrequency (frequency) {
  if (FREQUENCY_LIST.includes(frequency)) {
    return
  }

  const error = new Error('frequency_not_recognized')
  error.ctx = { frequency }

  throw error
}

/**
 * @param {string} frequency
 * @returns {boolean}
 */
export function isLowFrequency (frequency) {
  return frequency === FREQUENCY_HOURLY ||
    frequency === FREQUENCY_10S
}

/**
 * @param {string} frequency
 * @returns {[Date, Date]}
 */
export function parseFrequency (frequency) {
  frequency = frequency.trim().toLowerCase()

  switch (frequency) {
    case FREQUENCY_MONTHLY: {
      const prev = new Date()
      prev.setDate(1)
      prev.setHours(0, -prev.getTimezoneOffset(), 0, 0)

      const next = new Date(prev)
      next.setMonth(next.getMonth() + 1)

      return [prev, next]
    }

    case FREQUENCY_DAILY: {
      const prev = new Date()
      prev.setHours(0, -prev.getTimezoneOffset(), 0, 0)

      const next = new Date(prev)
      next.setHours(24)

      return [prev, next]
    }

    case FREQUENCY_HOURLY: {
      const prev = new Date()
      prev.setMinutes(0, 0, 0)

      const next = new Date(prev)
      next.setHours(prev.getHours() + 1)

      return [prev, next]
    }

    case FREQUENCY_10S: {
      const prev = new Date()
      prev.setMilliseconds(0)

      const next = new Date(prev)
      next.setSeconds(prev.getSeconds() + 10)

      return [prev, next]
    }
  }
}

/**
 * @param {string} dir
 * @param {string} name
 * @returns {Promise<Stats>}
 */
export async function readFileStats (dir, name) {
  const stats = await fs.promises.stat(path.resolve(dir, name))
  stats.name = name

  return stats
}

/**
 * @param {object} options
 * @param {string} options.name
 * @param {string|Null} [extension]
 * @param {Date|string|number|Null} [date]
 * @param {number|Null} [number]
 * @param {boolean|Null} [compress]
 * @returns {string}
 */
export const DEFAULT_FORMAT_NAME_FUNCTION = ({
  name,
  extension,
  date,
  number,
  compress
}) => {
  name ??= 'logrotieren.'

  if (date !== undefined && date !== null) {
    date = new Date(date)
    const y = date.getFullYear()
    const M = (date.getMonth() + 1).toString().padStart(2, '0')
    const d = date.getDate().toString().padStart(2, '0')

    name += `${y}-${M}-${d}.`
  }

  if (number !== null && number !== undefined) {
    name += `${number}.`
  }

  if (extension !== null && extension !== undefined) {
    name += extension
  } else {
    name = name.slice(0, name.length - 1)
  }

  if (compress) {
    name += '.gz'
  }

  return name
}
