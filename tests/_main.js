import fs from 'node:fs'
// import url from 'node:url'
import path from 'node:path'
import zlib from 'node:zlib'
// import stream from 'node:stream'
import assert from 'node:assert'
// import { Buffer } from 'node:buffer'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const LOREM_IPSUM_2048_BYTES = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc non sapien non eros tempus facilisis fermentum dapibus nunc. Sed diam tortor, gravida non dui ac, mollis lobortis neque. Proin non urna laoreet, egestas nunc quis, feugiat elit. Sed in tellus nec risus malesuada commodo. Suspendisse euismod ipsum nec sem faucibus consectetur. Donec at faucibus sapien, et aliquam libero. Sed eget nunc accumsan, facilisis risus pellentesque, semper augue. Aliquam efficitur mattis faucibus. Proin viverra auctor quam. Integer lacinia auctor tristique. Suspendisse gravida velit non dui fringilla suscipit. Ut semper bibendum tortor, vitae aliquet est elementum vel. Ut tincidunt, tortor sit amet euismod egestas, orci dolor scelerisque elit, non ornare sapien libero ac odio. Maecenas magna dui, convallis vitae orci sit amet, venenatis feugiat augue. Fusce maximus sem et magna imperdiet sodales. Ut tincidunt orci at erat ultricies malesuada.

Phasellus dictum non mi suscipit luctus. Sed laoreet, quam eu scelerisque aliquet, leo nunc lu ipsum, aliquam dignissim eros dolor ut sapien. Vestibulum consequat nibh sed sem condimentum, varius condimentum orci lacinia. Nunc elementum, mi in interdum malesuada, lectus dolor gravida nisi, eget accumsan erat leo vitae orci. Nulla rutrum tincidunt tincidunt. Fusce dignissim ullamcorper eros eu luctus. Nullam at tellus metus. Cras lobortis euismod euismod. Pellentesque vel placerat sem.

Sed quis elit nec felis mattis tempor. Curabitur bibendum iaculis pharetra. Integer nec ipsum ac quam vestibulum aliquam. Etiam rhoncus elementum mollis. Nunc libero dolor, pharetra eget consequat quis, condimentum eu velit. Nullam iaculis sed erat ac vestibulum. In dictum ante nisl, id commodo purus commodo ut. Vivamus vel eros eu felis varius auctor. Duis sed nisi at dui fringilla dignissim sit amet ac tortor. Aliquam vestibulum tempor libero, et facilisis diam suscipit ultrices. Proin rutrum est ut neque pellentesque, in interdum nibh porta. Nunc a dignissim est, ac interdum odio. Sed tristique ligula e

`

const LOG_DIR_NAME = 'logs'

/**
 * @param {object} options
 * @param {string} options.__dirname
 * @param {Rotator.} options.Rotator
 */
async function _main ({ __dirname, Rotator, constants }) {
  const logDirPath = path.resolve(__dirname, LOG_DIR_NAME)

  async function prepare (__dirname) {
    try {
      await fs.promises.mkdir(logDirPath)
    } catch {}
  }

  async function end (__dirname) {
    try {
      await fs.promises.rm(logDirPath, { recursive: true, force: true })
    } catch {}
  }

  async function createLogger () {
    const name = Math.random().toString().slice(2, 10)
    const ext = 'log'
    const fullName = name + '.' + ext

    const filePath = path.resolve(logDirPath, fullName)

    await fs.promises.writeFile(filePath, '')

    const stop = () => clearInterval(intervalId)

    const obj = {
      name,
      ext,
      fullName,
      filePath,
      count: 0,
      data: '',
      stop
    }

    const intervalId = setInterval(async () => {
      try {
        await fs.promises.appendFile(filePath, LOREM_IPSUM_2048_BYTES)
        obj.data += LOREM_IPSUM_2048_BYTES
        ++obj.count
      } catch {
        stop()
      }
    }, 1000)

    return obj
  }

  async function testFrequency ({ n, frequency, behavior, lifetime }) {
    const logger = await createLogger()
    const stateFileName = logger.name + '.state.json'
    const stateFileNamePath = path.resolve(__dirname, stateFileName)
    const files = []
    const rotator = new Rotator({
      filePath: logger.filePath,
      dirPath: logDirPath,
      frequency,
      behavior,
      cwd: __dirname,
      stateFileName
    })

    try {
      await rotator.start()
      rotator.on(constants.EVENT_ROTATE, (fileInfo) => {
        files.push(fileInfo)
      })
      await delay(lifetime * 1000)
      rotator.stop()
      logger.stop()

      const div = parseInt(frequency)
      const expectedFilesNumber = Math.floor(lifetime / div)

      assert.strictEqual(
        files.length,
        expectedFilesNumber,
        `1.1 Rotator "${frequency}" "${behavior}" should create ${expectedFilesNumber} files but created ${files.length}`
      )

      files.push({ path: logger.filePath })

      const filesData = (
        await Promise.all(
          files.map(async (file) => {
            const data = await fs.promises.readFile(file.path)
            if (behavior === constants.BEHAVIOR_COPY_COMPRESS_TRUNCATE) {
              const clearData = await new Promise((resolve, reject) => {
                zlib.gunzip(data, (err, buffer) => {
                  if (err) return reject(err)

                  resolve(buffer)
                })
              })

              return clearData.toString('utf8')
            } else {
              return data.toString('utf8')
            }
          })
        )
      ).join('')

      assert.strictEqual(
        filesData,
        logger.data,
        `${n}.2 Rotator "${frequency}" "${behavior}" files content should be equal to content sent by logger`
      )

      if (
        behavior === constants.BEHAVIOR_COPY_TRUNCATE ||
        behavior === constants.BEHAVIOR_COPY_COMPRESS_TRUNCATE
      ) {
        // TODO check fd didn't change
      }
      if (behavior === constants.BEHAVIOR_CREATE) {
        // TODO check fd changed
      }

      console.log(`${n}.2 Rotator "${frequency}" "${behavior}" tests passed`)
    } catch (e) {
      await fs.promises.rm(path.resolve(__dirname, stateFileName), {
        force: true
      })
      throw e
    } finally {
      await Promise.all([
        fs.promises.rm(stateFileNamePath, { force: true }),
        ...files.map((file) => fs.promises.rm(file.path, { force: true }))
      ])
    }
  }

  await prepare()

  await Promise.all([
    testFrequency({
      n: 1,
      frequency: constants.FREQUENCY_3S,
      behavior: constants.BEHAVIOR_CREATE,
      lifetime: 10
    }),
    testFrequency({
      n: 2,
      frequency: constants.FREQUENCY_3S,
      behavior: constants.BEHAVIOR_COPY_TRUNCATE,
      lifetime: 10
    })
    // testFrequency({ // TODO not working
    //   n: 3,
    //   frequency: constants.FREQUENCY_3S,
    //   behavior: constants.BEHAVIOR_COPY_COMPRESS_TRUNCATE,
    //   lifetime: 10
    // })
  ])

  // TODO test for basic logrotate by maxSize
  // TODO check work of scenario with deleting due to old age
  // TODO check work of scenario with deleting due to max files limit
  // TODO check if non current files are deleted
  // TODO check for correct GZiping (unzip and check with what we wrote)

  await end()
}

export default _main
