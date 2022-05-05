
export const BEHAVIOR_CREATE = 'create'
export const BEHAVIOR_COPY_TRUNCATE = 'copy_truncate'
export const BEHAVIOR_COPY_COMPRESS_TRUNCATE = 'copy_compress_truncate'

export const BEHAVIOR_LIST = [
  BEHAVIOR_CREATE,
  BEHAVIOR_COPY_TRUNCATE,
  BEHAVIOR_COPY_COMPRESS_TRUNCATE
]

export const FREQUENCY_MONTHLY = 'monthly'
export const FREQUENCY_DAILY = 'daily'
export const FREQUENCY_HOURLY = 'hourly'
export const FREQUENCY_10S = '10s'

export const FREQUENCY_LIST = [
  FREQUENCY_MONTHLY,
  FREQUENCY_DAILY,
  FREQUENCY_HOURLY,
  FREQUENCY_10S
]

export const EVENT_ERROR = 'error'
export const EVENT_READY = 'ready'
export const EVENT_ROTATE = 'rotate'
export const EVENT_PREROTATE = 'rotate'
