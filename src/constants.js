export const LOG_STATE_FILE_NAME = 'logstate.json'

export const BEHAVIOR_CREATE = 'create'
export const BEHAVIOR_COPY_TRUNCATE = 'copy_truncate'
export const BEHAVIOR_COPY_COMPRESS_TRUNCATE = 'copy_compress_truncate'

export const BEHAVIOR_LIST = [
  BEHAVIOR_CREATE,
  BEHAVIOR_COPY_TRUNCATE,
  BEHAVIOR_COPY_COMPRESS_TRUNCATE
]

export const FREQUENCY_MONTHLY = 'monthly'
export const FREQUENCY_WEEKLY = 'weekly'
export const FREQUENCY_DAILY = 'daily'
export const FREQUENCY_HOURLY = 'hourly'
export const FREQUENCY_10S = '10s'
export const FREQUENCY_3S = '3s'

export const FREQUENCY_LIST = [
  FREQUENCY_MONTHLY,
  FREQUENCY_WEEKLY,
  FREQUENCY_DAILY,
  FREQUENCY_HOURLY,
  FREQUENCY_10S,
  FREQUENCY_3S
]

export const HIGH_FREQUENCY_LIST = [
  FREQUENCY_HOURLY,
  FREQUENCY_10S,
  FREQUENCY_3S
]

export const EVENT_ERROR = 'error'
export const EVENT_READY = 'ready'
export const EVENT_ROTATE = 'rotate'

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
  name ??= 'logrotieren'
  name += '.'

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
