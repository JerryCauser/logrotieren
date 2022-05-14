import fs from 'node:fs'
import path from 'node:path'
import {
  BEHAVIOR_LIST,
  FREQUENCY_LIST,
  FREQUENCY_MONTHLY,
  FREQUENCY_WEEKLY,
  FREQUENCY_DAILY,
  FREQUENCY_HOURLY,
  FREQUENCY_10S,
  FREQUENCY_3S,
  HIGH_FREQUENCY_LIST
} from './constants.js'

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
 *
 * @param {string|Null} [frequency]
 * @returns {string|Null}
 */
export function sanitizeValidateFrequency (frequency) {
  if (frequency === null || frequency === undefined) {
    return null
  }

  if (FREQUENCY_LIST.includes(frequency)) {
    return frequency
  }

  const error = new Error('frequency_not_recognized')
  error.ctx = { frequency }

  throw error
}

/**
 * @param {string} frequency
 * @returns {boolean}
 */
export function isHighFrequency (frequency) {
  return HIGH_FREQUENCY_LIST.includes(frequency)
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

    case FREQUENCY_WEEKLY: {
      const prev = new Date()
      const day = (prev.getDay() || 7) - 1
      prev.setDate(prev.getDate() - day)
      prev.setHours(0, -prev.getTimezoneOffset(), 0, 0)

      const next = new Date(prev)
      next.setDate(next.getDate() + 7)

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

    case FREQUENCY_3S: {
      const prev = new Date()
      prev.setMilliseconds(0)

      const next = new Date(prev)
      next.setSeconds(prev.getSeconds() + 3)

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
 * @param {string} dirPath
 * @returns {Promise<void>}
 */
export async function checkDirAccess (dirPath) {
  try {
    await fs.promises.access(dirPath, fs.constants.R_OK | fs.constants.W_OK)
  } catch {
    const error = new Error('dir_is_not_accessible')
    error.file = dirPath

    throw error
  }
}
