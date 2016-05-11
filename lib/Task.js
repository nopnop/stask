'use strict'
const co = require('bluebird-co').co
const filepathToId = require('./utils').filepathToId
const normalizeId = require('./utils').normalizeId
const getIdPrefix = require('./utils').getIdPrefix
const getIdIndex = require('./utils').getIdIndex
const isValidFilename = require('./utils').isValidFilename
const fs = require('fs-extra-promise')
const path = require('path')
const yaml = require('js-yaml')
const debug = require('debug')('stask')
const omit = require('lodash.omit')
const kebabcase = require('lodash.kebabcase')

// Parse task file regex
const REG_PARSE = /^(?:(?:```yaml|<!--\n)((?:[^\n]*|\n)*?)(?:```|-->)(?:\n+---)?\n+)?(?:#*\s*)?(.+)((?:[^\n]*|\n)*?)(?:(\-{3,}\n)((?:[^\n]*|\n)*?))?$/

/**
 * A task object
 */
class Task {
  constructor (data) {
    this.id = undefined
    this.prefix = undefined
    this.index = undefined
    this.label = undefined
    this.description = undefined
    this.filepath = undefined
    this.created = undefined
    this.updated = undefined

    // Formating
    this.space = ''
    this.alt = '+'

    this.meta = {}

    if (data) {
      this.fromJSON(data)
    }
  }

  get relpath () {
    return this.getRelativePath()
  }

  get done () {
    return this.meta.done
  }

  set done (value) {
    this.meta.done = value
  }

  /**
   * Return the expected filename
   * @return {String}
   */
  getExpectedFilepath () {
    let newFilename = this.id + '_' + kebabcase(this.label).slice(0, 100) + '.md'
    let relativeTo = this.filepath ? path.dirname(this.filepath) : process.cwd()
    let newFilepath = path.join(relativeTo, newFilename)
    return newFilepath
  }

  /**
   * Write on disk the markdown version of the task
   *
   * @return {Promise<String>} the new filepath
   */
  write () {
    return co(function * () {
      debug('write: %s', this.id)
      let newFilepath = this.getExpectedFilepath()
      if (newFilepath !== this.filepath) {
        if (this.filepath) {
          debug('write: new filepath %s', newFilepath)
          try {
            yield fs.moveAsync(this.filepath, newFilepath)
          } catch (_) {}
        }
        this.filepath = newFilepath
      }

      // Get current content and write file only if changes occured (to limit
      // fs write)
      let content = new Buffer(this.toMarkdown())
      let current = yield fs.readFileAsync(this.filepath).catch(e => new Buffer(''))

      if (!current.equals(content)) {
        debug('write: task content has changed, update...', this.filepath)
        yield fs.outputFileAsync(this.filepath, content)
        let data = yield Task.parse(this.filepath)
        this.fromJSON(data)
      } else {
        debug('write: task content is unchanged, pass', this.filepath)
      }

      return this.filepath
    }.bind(this))
  }

  /**
   * Generate the markdown version of the task
   * @return {string}
   */
  toMarkdown () {
    let metaStr = yaml.safeDump(omit(this.meta, ['id']))
    let label = this.label
    let description = this.description || ''
    let content = '```yaml\n' + metaStr + '```\n\n'
    content += '### ' + label
    content += description ? '\n\n' + description : ''
    content += '\n'
    return content
  }

  /**
   * Get path relative to cwd (or process.cwd())
   * @param  {String} [relativeTo]
   *         relative to this folder (default: process.cwd())
   * @return {String}  relative path
   */
  getRelativePath (relativeTo) {
    relativeTo = relativeTo || process.cwd()
    return this.filepath ? path.relative(relativeTo, this.filepath) : null
  }

  /**
   * Generate a JSON-compatible object
   * @param  {Object} [options]
   *         - full: Add more information (such as the task description)
   *         - flat: Merge meta data with resulting object
   * @return {[type]}         [description]
   */
  toJSON (options) {
    options = options || {}
    let result = Object.assign({}, {
      id: this.id,
      prefix: this.prefix,
      index: this.index,
      filepath: this.getRelativePath(),
      updated: this.updated,
      created: this.created,
      label: this.label,
      description: this.description
    }, this.meta)

    if (options.full) {
      result.description = this.description
    }

    if (options.flat) {
      result = Object.assign({}, this.meta, result)
    } else {
      result.meta = Object.assign({}, this.meta)
    }

    return result
  }

  /**
   * Read form a json (flat or not) object
   * @param  {Object} data Json
   * @return {Task} this instance
   */
  fromJSON (data) {
    this.id = normalizeId(data.id)
    this.prefix = getIdPrefix(this.id)
    this.index = getIdIndex(this.id)
    this.filepath = data.filepath ? path.resolve(process.cwd(), data.filepath) : null
    this.updated = data.updated || new Date()
    this.created = data.created || new Date()
    this.label = data.label
    this.description = data.description
    this.meta = data.meta || {}

    this.meta = Object.assign({}, data.meta || {}, omit(data, [
      'id',
      'filepath',
      'prefix',
      'index',
      'updated',
      'created',
      'meta',
      'label',
      'description'
    ]))

    return this
  }
}

/**
 * Create a new Task instance from a raw JSON tasks
 * @param  {Object} data
 * @return {Task}
 */
Task.create = function (data) {
  return new Task(data)
}

/**
 * Parse a serialized task file
 * @param  {string} filepath
 * @return {Promise<Task>}
 */
Task.open = function (filepath) {
  return Task.parse(filepath).then((data) => (new Task(data)))
}

/**
 * Read and parse a task file
 * @param  {String} filepath Task filepath (must have the correction filename pattern)
 * @return {Promise<Object>}
 */
Task.parse = co.wrap(function * (filepath) {
  if (!isValidFilename(filepath)) {
    throw new Error('Invalid filename')
  }
  let id = filepathToId(filepath)

  let content = (yield fs.readFileAsync(filepath, { encoding: 'utf8' })).trim()
  let stats = yield fs.statAsync(filepath)

  // Reset Regex parser
  REG_PARSE.lastIndex = 0
  let result = REG_PARSE.exec(content)

  let metaraw = result[1]
  let label = result[2].trim()
  let description = (result[3] || '').trim()
  let meta
  try {
    meta = yaml.safeLoad(metaraw, {
      filename: filepath,
      onWarning: function (warning) {
        debug('warning', warning)
      }
    })
    if (typeof meta !== 'object') {
      throw new Error('Invalid meta type')
    }
  } catch (error) {
    meta = { error: error }
    debug('error', error)
  }

  id = meta.id = normalizeId(meta.id || id)
  return {
    id: id,
    prefix: getIdPrefix(id),
    index: getIdIndex(id),
    filepath: filepath,
    updated: stats.mtime,
    created: stats.ctime,
    meta: meta,
    label: label,
    description: description
  }
})

module.exports = Task
