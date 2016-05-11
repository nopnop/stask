'use strict'
const Promise = require('bluebird')
const fs = require('fs-extra-promise')
const co = require('bluebird-co').co
const path = require('path')
const normalizeId = require('../utils').normalizeId
const listTasks = require('../utils').listTasks
const getIdPrefix = require('../utils').getIdPrefix
const Task = require('../Task.js')
const debug = require('debug')('stask:update')
const add = require('./add')
const chokidar = require('chokidar')
const debounce = require('lodash.debounce')
const difference = require('lodash.difference')
const omit = require('lodash.omit')

// Find task items in a list
const REG_TASKITEM = /^(\s*)\-\s(\[(?:\s|x|X)\])\s(.*?)(\[([^\]]+)\]\(([^\)]+)\))?$/gm

/**
 * Update task
 * @param  {string}  listFp  The list filepath
 * @return {[type]}          [description]
 */
const update = co.wrap(function * (listFp, options) {
  listFp = path.resolve(listFp)
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

  if (!listFp) {
    listFp = path.join(process.cwd(), 'readme.md')
  }

  if (!fs.existsSync(listFp)) {
    yield fs.outputFile(listFp, '# Task list\n\n')
  }

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

    // If the matched task entry does not exists just update list item
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
    debug('some task file are not in the list', missing)
    let missedList = []
    yield Promise.each(missing, co.wrap(function * (id) {
      let task = yield Task.open(listing[id].filepath)
      missedList.push(formatLine(task))
    }))
    content += '\n---\n##### New task added on ' + (new Date()).toISOString()
    content += '\n' + missedList.join('\n')
    content += '\n'
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

    // Parse meta from label
    let regMeta = /(?:(?:@(\w+)\(([^\)]+)\))|(?:@(\w+))|#(\w+))\s*/g
    this.label = this.label.replace(regMeta, (match, key, value, flag, tag) => {
      if (key !== undefined) {
        this.meta[key] = parseMetaValue(value)
      } else if (flag !== undefined) {
        this.meta[flag] = true
      } else if (tag !== undefined) {
        this.meta.tags = this.meta.tags || []
        this.meta.tags.push(tag)
      }
      return ''
    })
    this.label = this.label.trim()

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

function formatLine (infos, addMeta) {
  let check = infos.done ? '[x]' : '[ ]'
  let link = infos.relpath ? ` [${infos.alt}](${infos.relpath})` : ''
  let label = infos.label
  if (addMeta) {
    let fMetas = formatMeta(omit(addMeta, ['done']))
    label = fMetas ? label + ' ' + fMetas : label
  }
  return `${infos.space}- ${check} ${label}${link}`
}

function formatMeta (metas) {
  let fMetas = []
  Object.keys(metas).forEach((key) => {
    let value = metas[key]
    if (typeof value === 'string') {
      fMetas.push(`@${key}(${value})`)
    } else if (typeof value === 'boolean') {
      if (value) {
        fMetas.push(`@${key}`)
      } else {
        fMetas.push(`@${key}(false)`)
      }
    } else if (Object.prototype.toString.call(value) === '[object Date]') {
      let sDate = value.toISOString().slice(0, 10)
      fMetas.push(`@${key}(${sDate})`)
    } else if (key === 'tags' && Array.isArray(value)) {
      value.forEach(v => fMetas.push('#' + v))
    }
  })
  return fMetas.join(' ')
}

function parseMetaValue (value) {
  if (!value) {
    return value
  } else if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === 'true'
  } else if (/^\d+$/.test(value)) {
    return parseInt(value, 10)
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value)
  } else if ((new Date(value)).toString() !== 'Invalid Date') {
    return new Date(value)
  } else {
    return value
  }
}

update.help = 'Read tasks in a list and update related task files'

module.exports = update
