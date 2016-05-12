'use strict'
const Promise = require('bluebird')
const fs = require('fs-extra-promise')
const co = require('bluebird-co').co
const path = require('path')
const normalizeId = require('../utils').normalizeId
const listTasks = require('../utils').listTasks
const getIdPrefix = require('../utils').getIdPrefix
const extractMeta = require('../utils').extractMeta
const formatLine = require('../utils').formatLine
const Task = require('../Task.js')
const debug = require('debug')('stask:update')
const add = require('./add')
const chokidar = require('chokidar')
const debounce = require('lodash.debounce')
const difference = require('lodash.difference')

// Find task items in a list
const REG_TASKITEM = /^(\s*)\-\s(\[(?:\s|x|X)\])\s(.*?)(\[([^\]]+)\]\(([^\)]+)\))?$/gm

/**
 * Update task
 * @param  {string}  listFp  The list filepath
 * @return {[type]}          [description]
 */
const update = co.wrap(function * (listFp, options) {
  if (!listFp) {
    listFp = path.join(process.cwd(), 'readme.md')
  }

  listFp = path.resolve(listFp)

  if (!fs.existsSync(listFp)) {
    yield fs.outputFile(listFp, '# Task list\n\n')
  }

  if (options.watch) {
    return runWatcher(listFp, options)
  } else {
    return runUpdate(listFp, options)
  }
})

const runWatcher = function (listFp, options) {
  console.error('[%s] Start continous watcher', (new Date()).toISOString())

  let watcher = chokidar.watch('**/*.md', {
    cwd: process.cwd(),
    ignoreInitial: true,
    ignored: ['**/.*', 'node_modules/**']
  })

  let ignore = false

  const onChange = debounce(co.wrap(function * () {
    ignore = true
    try {
      yield runUpdate(listFp, options)
    } catch (error) {
      console.error(error.stack)
    }
    yield Promise.resolve().delay(500)
    ignore = false
  }), 500)

  watcher
    .on('add', handleFile)
    .on('change', handleFile)
    .on('unlink', handleFile)

  function handleFile (changedFp) {
    if (ignore) {
      return
    }
    changedFp = path.resolve(process.cwd(), changedFp)
    if ((changedFp !== listFp) &&
      !/^[a-z]+\d+.*\.md$/i.test(path.basename(changedFp))) {
      return
    }
    debug('handleFile', changedFp)
    onChange()
  }

  // start once
  onChange()
}

const runUpdate = co.wrap(function * (listFp, options) {
  console.error('[%s] Update list and task...', (new Date()).toISOString())
  options = options || {}

  let relativeTo = path.dirname(listFp)

  let stats
  try {
    stats = yield fs.statAsync(listFp)
  } catch (e) {
    throw new Error('Unable to read list file (' + e.message + ')')
  }

  // Read list content
  let content = yield fs.readFileAsync(listFp, 'utf8')
  let initialContent = content

  let updated = stats.mtime

  // Get tasks list
  let listing = yield listTasks()
  let ids = Object.keys(listing)
  let doneIds = []

  // Search for task entry in the source
  let found = []
  let match
  REG_TASKITEM.lastIndex = 0
  let last
  while ((match = REG_TASKITEM.exec(content))) {
    let matched = new Matched(match, relativeTo)
    if (!matched.label) {
      continue
    }
    debug('found #%s', matched.id, matched.label, matched.index)
    found.push(matched)
    if (last) {
      last.next = matched
    }
    last = matched
  }

  // Run update
  yield Promise.each(found, co.wrap(function * (matched) {
    let task
    debug('do #%s', matched.id, matched.label, matched.index)

    // If the matched task entry does not exists create
    if (!matched.id || !listing[matched.id]) {
      task = yield add(Object.assign({}, options, {
        id: matched.id,
        label: matched.label,
        done: matched.done,
        prefix: matched.prefix || options.prefix,
        meta: matched.meta || {}
      }))
      matched.id = task.id
    } else {
      // Load task
      task = yield Task.open(listing[matched.id].filepath)
    }

    if (updated < task.updated) {
      debug('List is older than task. Update list')
      if (task.getExpectedFilepath() !== task.filepath) {
        debug('Task rename required')
        yield task.write()
      }
      matched.label = task.label
      matched.done = Boolean(task.meta.done)
      matched.updateExplicitMeta(task.meta)
    } else {
      debug('List is newer than task. Update task if needed')
      task.label = matched.label
      task.meta.done = matched.done
      Object.assign(task.meta, matched.meta)
      yield task.write()
    }

    // Update list relpath if needed
    if (task.filepath !== matched.filepath) {
      matched.filepath = task.filepath
    }

    // If needed, update content
    content = matched.update(content)

    doneIds.push(matched.id)
  }))

  // Handle tasks not handled by the list:
  let missing = difference(ids, doneIds)
  if (missing.length) {
    let missedList = []
    yield Promise.each(missing, co.wrap(function * (id) {
      let task = yield Task.open(listing[id].filepath)
      if (!task.meta.archived && !task.meta.hidden) {
        missedList.push(formatLine(task))
      }
      if (task.meta.DELETE) {
        task.unlink()
      }
      if (task.meta.TRASH) {
        task.trash()
      }
    }))
    if (missedList.length) {
      debug('some task file are not in the list', missedList.join('\n'))
      content += '\n---\n##### New task added on ' + (new Date()).toISOString()
      content += '\n' + missedList.join('\n')
      content += '\n'
    }
  }

  // Write file content if needed
  if (content !== initialContent) {
    debug('List as changed, write list')
    yield fs.outputFileAsync(listFp, content)
  }
})

/**
 * Handle a task item in a list
 */
class Matched {

  /**
   * Build a matched handler
   * @param  {Array} match Regex match result
   */
  constructor (match, relativeTo) {
    this.relativeTo = relativeTo
    this.raw = match[0]
    this.space = match[1]
    this.label = match[3].trim()

    this.meta = {
      done: match[2] === '[x]' || match[2] === '[X]'
    }

    // Extract meta
    let result = extractMeta(this.label, this.meta)
    this.label = result.label
    this.meta = result.meta

    // Formating
    this.alt = '+'
    this.filepath = null

    this.id = null

    if (match[4]) {
      let checkFn = /^([a-z]+\d+).*\.md$/.exec(path.basename(match[6]))
      if (checkFn) {
        this.alt = match[5]
        this.filepath = path.resolve(relativeTo, match[6])
        this.id = normalizeId(checkFn[1])
        this.prefix = getIdPrefix(this.id)
      } else {
        this.label = match[3] + match[4]
      }
    }
    this.index = match.index
  }

  get done () {
    return this.meta.done
  }

  set done (value) {
    this.meta.done = value
  }

  get relpath () {
    return this.filepath ? path.relative(this.relativeTo, this.filepath) : null
  }

  /**
   * Update only meta defined on the initial label
   * @param  {Object} meta Inherit value from this meta object
   */
  updateExplicitMeta (meta) {
    Object.keys(this.meta).forEach((key) => {
      if (meta[key] !== undefined) {
        this.meta[key] = meta[key]
      }
    })
  }

  /**
   * Update the list source and move next item index
   * @param  {String} content The raw list content
   * @return {String}         The list content updated
   */
  update (content) {
    let line = formatLine(this, this.meta)
    let delta = line.length - this.raw.length
    content = content.slice(0, this.index) + line + content.slice(this.index + this.raw.length)

    // Move index delta
    let next = this
    while ((next = next.next)) { next.index += delta }

    return content
  }
}

update.help = 'Read tasks in a list and update related task files'

module.exports = update
