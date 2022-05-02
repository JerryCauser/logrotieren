import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {string} frequency
 * @returns {[Date, Date]}
 */
export function parseFrequency (frequency) {
  frequency = frequency.trim().toLowerCase()

  switch (frequency) {
    case 'monthly': {
      const prev = new Date()
      prev.setDate(1)
      prev.setHours(0, -prev.getTimezoneOffset(), 0, 0)

      const next = new Date(prev)
      next.setMonth(next.getMonth() + 1)

      return [prev, next]
    }

    case 'daily': {
      const prev = new Date()
      prev.setHours(0, -prev.getTimezoneOffset(), 0, 0)

      const next = new Date(prev)
      next.setHours(24)

      return [prev, next]
    }

    case 'hourly': {
      const prev = new Date()
      prev.setMinutes(0, 0, 0)

      const next = new Date(prev)
      next.setHours(prev.getHours() + 1)

      return [prev, next]
    }

    case '10s': {
      const prev = new Date()
      prev.setMilliseconds(0)

      const next = new Date(prev)
      next.setSeconds(prev.getSeconds() + 10)

      return [prev, next]
    }

    default: {
      throw new Error('frequency_not_recognized')
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
 * @returns {string}
 */
export const DEFAULT_FORMAT_NAME_FUNCTION = ({ name, extension, date, number }) => {
  name ??= '.'

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

  return name
}
