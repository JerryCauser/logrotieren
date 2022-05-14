var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// index.js
var logrotieren_exports = {};
__export(logrotieren_exports, {
  constants: () => constants_exports,
  default: () => rotator_default
});
module.exports = __toCommonJS(logrotieren_exports);

// src/rotator.js
var import_node_fs2 = __toESM(require("fs"), 1);
var import_node_path = __toESM(require("path"), 1);
var import_node_zlib = __toESM(require("zlib"), 1);
var import_node_stream = __toESM(require("stream"), 1);
var import_node_events = require("events");

// src/helpers.js
var import_node_fs = __toESM(require("fs"), 1);

// src/constants.js
var constants_exports = {};
__export(constants_exports, {
  BEHAVIOR_COPY_COMPRESS_TRUNCATE: () => BEHAVIOR_COPY_COMPRESS_TRUNCATE,
  BEHAVIOR_COPY_TRUNCATE: () => BEHAVIOR_COPY_TRUNCATE,
  BEHAVIOR_CREATE: () => BEHAVIOR_CREATE,
  BEHAVIOR_LIST: () => BEHAVIOR_LIST,
  DEFAULT_FORMAT_NAME_FUNCTION: () => DEFAULT_FORMAT_NAME_FUNCTION,
  EVENT_ERROR: () => EVENT_ERROR,
  EVENT_READY: () => EVENT_READY,
  EVENT_ROTATE: () => EVENT_ROTATE,
  FREQUENCY_10S: () => FREQUENCY_10S,
  FREQUENCY_3S: () => FREQUENCY_3S,
  FREQUENCY_DAILY: () => FREQUENCY_DAILY,
  FREQUENCY_HOURLY: () => FREQUENCY_HOURLY,
  FREQUENCY_LIST: () => FREQUENCY_LIST,
  FREQUENCY_MONTHLY: () => FREQUENCY_MONTHLY,
  FREQUENCY_WEEKLY: () => FREQUENCY_WEEKLY,
  HIGH_FREQUENCY_LIST: () => HIGH_FREQUENCY_LIST,
  LOG_STATE_FILE_NAME: () => LOG_STATE_FILE_NAME
});
var LOG_STATE_FILE_NAME = "logstate.json";
var BEHAVIOR_CREATE = "create";
var BEHAVIOR_COPY_TRUNCATE = "copy_truncate";
var BEHAVIOR_COPY_COMPRESS_TRUNCATE = "copy_compress_truncate";
var BEHAVIOR_LIST = [
  BEHAVIOR_CREATE,
  BEHAVIOR_COPY_TRUNCATE,
  BEHAVIOR_COPY_COMPRESS_TRUNCATE
];
var FREQUENCY_MONTHLY = "monthly";
var FREQUENCY_WEEKLY = "weekly";
var FREQUENCY_DAILY = "daily";
var FREQUENCY_HOURLY = "hourly";
var FREQUENCY_10S = "10s";
var FREQUENCY_3S = "3s";
var FREQUENCY_LIST = [
  FREQUENCY_MONTHLY,
  FREQUENCY_WEEKLY,
  FREQUENCY_DAILY,
  FREQUENCY_HOURLY,
  FREQUENCY_10S,
  FREQUENCY_3S
];
var HIGH_FREQUENCY_LIST = [
  FREQUENCY_HOURLY,
  FREQUENCY_10S,
  FREQUENCY_3S
];
var EVENT_ERROR = "error";
var EVENT_READY = "ready";
var EVENT_ROTATE = "rotate";
var DEFAULT_FORMAT_NAME_FUNCTION = ({
  name,
  extension,
  date,
  number,
  compress
}) => {
  name ?? (name = "logrotieren");
  name += ".";
  if (date !== void 0 && date !== null) {
    date = new Date(date);
    const y = date.getFullYear();
    const M = (date.getMonth() + 1).toString().padStart(2, "0");
    const d = date.getDate().toString().padStart(2, "0");
    name += `${y}-${M}-${d}.`;
  }
  if (number !== null && number !== void 0) {
    name += `${number}.`;
  }
  if (extension !== null && extension !== void 0) {
    name += extension;
  } else {
    name = name.slice(0, name.length - 1);
  }
  if (compress) {
    name += ".gz";
  }
  return name;
};

// src/helpers.js
function validateBehavior(behavior) {
  if (BEHAVIOR_LIST.includes(behavior)) {
    return;
  }
  const error = new Error("behavior_not_recognized");
  error.ctx = { behavior };
  throw error;
}
function sanitizeValidateSize(maxSize) {
  if (maxSize === null || maxSize === void 0) {
    return null;
  }
  if (typeof maxSize === "number") {
    return maxSize > 0 ? maxSize : null;
  }
  if (typeof maxSize === "string") {
    let [, size, postfix] = maxSize.match(/(\d+)\s?([a-z])?/i) || [];
    if (size !== void 0) {
      size = parseInt(size, 10);
      if (size <= 0)
        return null;
      if (postfix !== void 0) {
        switch (postfix.toLowerCase()) {
          case "k":
            return size * 2 ** 10;
          case "m":
            return size * 2 ** 20;
          case "g":
            return size * 2 ** 30;
        }
      }
    }
  }
  const error = new Error("max_size_not_valid");
  error.ctx = { maxSize };
  throw error;
}
function sanitizeValidateFrequency(frequency) {
  if (frequency === null || frequency === void 0) {
    return null;
  }
  if (FREQUENCY_LIST.includes(frequency)) {
    return frequency;
  }
  const error = new Error("frequency_not_recognized");
  error.ctx = { frequency };
  throw error;
}
function isHighFrequency(frequency) {
  return HIGH_FREQUENCY_LIST.includes(frequency);
}
function parseFrequency(frequency) {
  frequency = frequency.trim().toLowerCase();
  switch (frequency) {
    case FREQUENCY_MONTHLY: {
      const prev = new Date();
      prev.setDate(1);
      prev.setHours(0, -prev.getTimezoneOffset(), 0, 0);
      const next = new Date(prev);
      next.setMonth(next.getMonth() + 1);
      return [prev, next];
    }
    case FREQUENCY_WEEKLY: {
      const prev = new Date();
      const day = (prev.getDay() || 7) - 1;
      prev.setDate(prev.getDate() - day);
      prev.setHours(0, -prev.getTimezoneOffset(), 0, 0);
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return [prev, next];
    }
    case FREQUENCY_DAILY: {
      const prev = new Date();
      prev.setHours(0, -prev.getTimezoneOffset(), 0, 0);
      const next = new Date(prev);
      next.setHours(24);
      return [prev, next];
    }
    case FREQUENCY_HOURLY: {
      const prev = new Date();
      prev.setMinutes(0, 0, 0);
      const next = new Date(prev);
      next.setHours(prev.getHours() + 1);
      return [prev, next];
    }
    case FREQUENCY_10S: {
      const prev = new Date();
      prev.setMilliseconds(0);
      const next = new Date(prev);
      next.setSeconds(prev.getSeconds() + 10);
      return [prev, next];
    }
    case FREQUENCY_3S: {
      const prev = new Date();
      prev.setMilliseconds(0);
      const next = new Date(prev);
      next.setSeconds(prev.getSeconds() + 3);
      return [prev, next];
    }
  }
}
async function checkDirAccess(dirPath) {
  try {
    await import_node_fs.default.promises.access(dirPath, import_node_fs.default.constants.R_OK | import_node_fs.default.constants.W_OK);
  } catch {
    const error = new Error("dir_is_not_accessible");
    error.file = dirPath;
    throw error;
  }
}

// src/rotator.js
var _filePath, _name, _extension, _nameWithExtension, _dirPath, _encoding, _frequency, _maxSize, _behavior, _filesLimit, _maxAge, _formatName, _compress, _state, _cwd, _stateFileName, _rotateTimeoutId, _watcher, _readState, readState_fn, _writeState, writeState_fn, _scheduleRotate, scheduleRotate_fn, _initWatcher, initWatcher_fn, _watchSizeHandler, _getNumber, getNumber_fn;
var Rotator = class extends import_node_events.EventEmitter {
  constructor(_a) {
    var _b = _a, {
      filePath,
      dirPath,
      frequency,
      encoding = "utf8",
      behavior = BEHAVIOR_COPY_TRUNCATE,
      maxSize = null,
      filesLimit = null,
      maxAge = null,
      formatName = DEFAULT_FORMAT_NAME_FUNCTION,
      cwd = process.cwd(),
      stateFileName = LOG_STATE_FILE_NAME
    } = _b, other = __objRest(_b, [
      "filePath",
      "dirPath",
      "frequency",
      "encoding",
      "behavior",
      "maxSize",
      "filesLimit",
      "maxAge",
      "formatName",
      "cwd",
      "stateFileName"
    ]);
    super(other);
    __privateAdd(this, _readState);
    __privateAdd(this, _writeState);
    __privateAdd(this, _scheduleRotate);
    __privateAdd(this, _initWatcher);
    __privateAdd(this, _getNumber);
    __privateAdd(this, _filePath, void 0);
    __privateAdd(this, _name, void 0);
    __privateAdd(this, _extension, void 0);
    __privateAdd(this, _nameWithExtension, void 0);
    __privateAdd(this, _dirPath, void 0);
    __privateAdd(this, _encoding, void 0);
    __privateAdd(this, _frequency, void 0);
    __privateAdd(this, _maxSize, void 0);
    __privateAdd(this, _behavior, void 0);
    __privateAdd(this, _filesLimit, void 0);
    __privateAdd(this, _maxAge, void 0);
    __privateAdd(this, _formatName, void 0);
    __privateAdd(this, _compress, false);
    __privateAdd(this, _state, {
      lastRotationAt: null,
      lastNumber: null
    });
    __privateAdd(this, _cwd, void 0);
    __privateAdd(this, _stateFileName, void 0);
    __privateAdd(this, _rotateTimeoutId, void 0);
    __privateAdd(this, _watcher, void 0);
    __privateAdd(this, _watchSizeHandler, async (event) => {
      switch (event) {
        case "rename": {
          __privateGet(this, _watcher).close();
          __privateMethod(this, _initWatcher, initWatcher_fn).call(this);
          break;
        }
        case "change": {
          const stat = await import_node_fs2.default.promises.stat(__privateGet(this, _filePath));
          if (stat.size >= __privateGet(this, _maxSize)) {
            await this.rotate();
          }
          break;
        }
      }
    });
    validateBehavior(behavior);
    frequency = sanitizeValidateFrequency(frequency);
    maxSize = sanitizeValidateSize(maxSize);
    const { name, ext } = import_node_path.default.parse(filePath);
    __privateSet(this, _filePath, filePath);
    __privateSet(this, _name, name);
    __privateSet(this, _extension, ext.slice(1));
    __privateSet(this, _nameWithExtension, `${__privateGet(this, _name)}.${__privateGet(this, _extension)}`);
    __privateSet(this, _dirPath, dirPath);
    __privateSet(this, _encoding, encoding);
    __privateSet(this, _frequency, frequency);
    __privateSet(this, _maxSize, maxSize);
    __privateSet(this, _behavior, behavior);
    __privateSet(this, _filesLimit, filesLimit);
    __privateSet(this, _maxAge, maxAge);
    __privateSet(this, _formatName, DEFAULT_FORMAT_NAME_FUNCTION);
    __privateSet(this, _compress, behavior === BEHAVIOR_COPY_COMPRESS_TRUNCATE);
    __privateSet(this, _cwd, cwd);
    __privateSet(this, _stateFileName, stateFileName);
  }
  async start() {
    await __privateMethod(this, _readState, readState_fn).call(this);
    try {
      await checkDirAccess(__privateGet(this, _dirPath));
    } catch {
      await import_node_fs2.default.promises.mkdir(__privateGet(this, _dirPath), { recursive: true });
      await checkDirAccess(__privateGet(this, _dirPath));
    }
    if (__privateGet(this, _maxSize)) {
      __privateMethod(this, _initWatcher, initWatcher_fn).call(this);
    }
    if (__privateGet(this, _frequency)) {
      await __privateMethod(this, _scheduleRotate, scheduleRotate_fn).call(this);
    }
    this.emit(EVENT_READY, this);
    return this;
  }
  async rotate(date = new Date()) {
    try {
      await import_node_fs2.default.promises.access(__privateGet(this, _filePath), import_node_fs2.default.constants.R_OK | import_node_fs2.default.constants.W_OK);
    } catch (e) {
      const error = new Error("file_is_not_accessible");
      error.file = __privateGet(this, _filePath);
      error.ctx = e;
      this.emit(EVENT_ERROR, error);
      return this;
    }
    const number = __privateMethod(this, _getNumber, getNumber_fn).call(this, date);
    const name = __privateGet(this, _formatName).call(this, {
      name: __privateGet(this, _name),
      extension: __privateGet(this, _extension),
      date,
      number
    });
    const targetPath = import_node_path.default.resolve(__privateGet(this, _dirPath), name);
    try {
      await import_node_fs2.default.promises.rm(targetPath);
    } catch {
    }
    switch (__privateGet(this, _behavior)) {
      case BEHAVIOR_CREATE: {
        await import_node_fs2.default.promises.rename(__privateGet(this, _filePath), targetPath);
        await import_node_fs2.default.promises.writeFile(__privateGet(this, _filePath), "", {
          encoding: __privateGet(this, _encoding),
          flag: "a"
        });
        break;
      }
      case BEHAVIOR_COPY_TRUNCATE: {
        await import_node_fs2.default.promises.copyFile(__privateGet(this, _filePath), targetPath);
        await import_node_fs2.default.promises.truncate(__privateGet(this, _filePath), 0);
        break;
      }
      case BEHAVIOR_COPY_COMPRESS_TRUNCATE: {
        await import_node_stream.default.promises.pipeline(import_node_fs2.default.createReadStream(__privateGet(this, _filePath), { encoding: __privateGet(this, _encoding) }), import_node_zlib.default.createGzip(), import_node_fs2.default.createWriteStream(targetPath, { encoding: __privateGet(this, _encoding) }));
        await import_node_fs2.default.promises.truncate(__privateGet(this, _filePath), 0);
        break;
      }
    }
    const fileInfo = { createdAt: date, number, name, path: targetPath };
    __privateGet(this, _state).files.push(fileInfo);
    await this.removeOldFiles();
    await __privateMethod(this, _writeState, writeState_fn).call(this, date, number);
    this.emit(EVENT_ROTATE, fileInfo);
    return this;
  }
  async removeOldFiles() {
    await this.removeSurplus();
    await this.removeOutdated();
  }
  async removeSurplus() {
    var _a;
    if (!__privateGet(this, _filesLimit) || !((_a = __privateGet(this, _state).files) == null ? void 0 : _a.length))
      return this;
    const promises = [];
    while (__privateGet(this, _state).files.length > __privateGet(this, _filesLimit)) {
      const file = __privateGet(this, _state).files.shift();
      promises.push(import_node_fs2.default.promises.rm(import_node_path.default.resolve(__privateGet(this, _dirPath), file.name)));
    }
    await Promise.allSettled(promises);
    return this;
  }
  async removeOutdated() {
    var _a;
    if (!__privateGet(this, _maxAge) || !((_a = __privateGet(this, _state).files) == null ? void 0 : _a.length))
      return this;
    const promises = [];
    const dateNow = Date.now();
    for (let i = 0; i < __privateGet(this, _state).files.length; ++i) {
      const file = __privateGet(this, _state).files[i];
      if (file.createdAt.getTime() + __privateGet(this, _maxAge) < dateNow) {
        promises.push(import_node_fs2.default.promises.rm(import_node_path.default.resolve(__privateGet(this, _dirPath), file.name)).then(() => __privateGet(this, _state).files.splice(i, 1)));
      } else {
        break;
      }
    }
    await Promise.allSettled(promises);
    return this;
  }
  stop() {
    clearTimeout(__privateGet(this, _rotateTimeoutId));
    if (__privateGet(this, _watcher))
      __privateGet(this, _watcher).close();
    return this;
  }
};
_filePath = new WeakMap();
_name = new WeakMap();
_extension = new WeakMap();
_nameWithExtension = new WeakMap();
_dirPath = new WeakMap();
_encoding = new WeakMap();
_frequency = new WeakMap();
_maxSize = new WeakMap();
_behavior = new WeakMap();
_filesLimit = new WeakMap();
_maxAge = new WeakMap();
_formatName = new WeakMap();
_compress = new WeakMap();
_state = new WeakMap();
_cwd = new WeakMap();
_stateFileName = new WeakMap();
_rotateTimeoutId = new WeakMap();
_watcher = new WeakMap();
_readState = new WeakSet();
readState_fn = async function() {
  try {
    const fileBody = await import_node_fs2.default.promises.readFile(import_node_path.default.resolve(__privateGet(this, _cwd), __privateGet(this, _stateFileName)), { encoding: __privateGet(this, _encoding) });
    __privateSet(this, _state, JSON.parse(fileBody.toString(__privateGet(this, _encoding)).trim()));
    if (__privateGet(this, _state).lastRotationAt !== null) {
      __privateGet(this, _state).lastRotationAt = new Date(__privateGet(this, _state).lastRotationAt);
    }
    if (Array.isArray(__privateGet(this, _state).files) && __privateGet(this, _state).files.length > 0) {
      for (const file of __privateGet(this, _state).files) {
        file.createdAt = new Date(file.createdAt);
      }
    } else {
      __privateGet(this, _state).files = [];
    }
  } catch {
    __privateSet(this, _state, {
      lastRotationAt: null,
      lastNumber: null,
      files: []
    });
  }
};
_writeState = new WeakSet();
writeState_fn = async function(date = null, number = null) {
  __privateGet(this, _state).lastRotationAt = date === null ? date : new Date(date);
  __privateGet(this, _state).lastNumber = number;
  await import_node_fs2.default.promises.writeFile(import_node_path.default.resolve(__privateGet(this, _cwd), __privateGet(this, _stateFileName)), JSON.stringify(__privateGet(this, _state), null, 2), { encoding: __privateGet(this, _encoding) });
};
_scheduleRotate = new WeakSet();
scheduleRotate_fn = async function() {
  const [prevRotation, nextRotation] = parseFrequency(__privateGet(this, _frequency));
  if (__privateGet(this, _state).lastRotationAt === null) {
    await __privateMethod(this, _writeState, writeState_fn).call(this, prevRotation, null);
  } else if (__privateGet(this, _state).lastRotationAt.getTime() <= prevRotation.getTime()) {
    process.nextTick(() => this.rotate());
  }
  const timeout = nextRotation.getTime() - Date.now();
  __privateSet(this, _rotateTimeoutId, setTimeout(() => __privateMethod(this, _scheduleRotate, scheduleRotate_fn).call(this), timeout));
};
_initWatcher = new WeakSet();
initWatcher_fn = function() {
  __privateSet(this, _watcher, import_node_fs2.default.watch(__privateGet(this, _filePath), __privateGet(this, _watchSizeHandler)));
};
_watchSizeHandler = new WeakMap();
_getNumber = new WeakSet();
getNumber_fn = function(date) {
  let number = null;
  if (isHighFrequency(__privateGet(this, _frequency)) || __privateGet(this, _maxSize) !== null) {
    if (__privateGet(this, _state).lastNumber === null) {
      number = 0;
    } else {
      if (__privateGet(this, _state).lastRotationAt.getFullYear() === date.getFullYear() && __privateGet(this, _state).lastRotationAt.getMonth() === date.getMonth() && __privateGet(this, _state).lastRotationAt.getDate() === date.getDate()) {
        number = __privateGet(this, _state).lastNumber + 1;
      } else {
        number = 0;
      }
    }
  }
  return number;
};
var rotator_default = Rotator;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  constants
});
