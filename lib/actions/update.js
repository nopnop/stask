'use strict'
const Promise = require('bluebird')
const fs = require('fs-extra-promise')
const co = require('bluebird-co').co
const path = require('path')
const parse = require('./parse')
const normalizeId = require('../utils').normalizeId
const filepathToId = require('../utils').filepathToId
const listTasks = require('../utils').listTasks
const findNextId = require('../utils').findNextId
const Task = require('../Task.js')
const debug = require('debug')('stask:update')

const update = co.wrap(function * (filepath, options) {
  return runUpdate(filepath, options) // TODO watch
})

const runUpdate = co.wrap(function * (filepath, options) {
  options = options || {}

  // Read list content
  let content = yield fs.readFileAsync(filepath, 'utf8')
  let initialContent = content

  let stats = yield fs.statAsync(filepath)
  let updated = stats.mtime

  // Get tasks list
  let listing = yield listTasks()
  let ids = Object.keys(listing)

  // Search for task entry in the source
  let found = []
  let match
  let reg = /^(\s*)\-\s(\[(?:\s|x|X)\])\s(.*?)(\[([^\]]+)\]\(([^\)]+)\))?$/gm
  let last
  while ((match = reg.exec(content))) {
    let matched = new Matched(match)
    found.push(matched)
    if (last) {
      last.next = matched
    }
    last = matched
  }

  // Track unexistant file task to increment suggested file id
  let countNotFound = 0

  // Run update
  yield Promise.map(found, co.wrap(function * (matched) {
    // If the matched task entry does not exists just update list item
    if (!matched.id || !listing[matched.id]) {
      countNotFound++
      let nextId = findNextId(ids, options.prefix, countNotFound)
      let task = new Task({
        id: nextId,
        label: matched.label
      })
      matched.id = nextId
      matched.relpath = './' + path.relative(process.cwd(), task.getExpectedFilepath())
      content = matched.update(content)
      return
    }

    // Load task
    let task = yield Task.open(listing[matched.id].filepath)

    if (updated < task.updated) {
      debug('List is older than task. Update list')
      matched.label = task.label
      matched.done = Boolean(task.meta.done)
    } else {
      debug('List is newer than task. Update task if needed')
      if ((task.label !== matched.label) || task.meta.done !== matched.done) {
        task.label = matched.label
        task.meta.done = matched.done
        yield task.write()
      }
    }

    // Update list relpath if needed
    let relpath = './' + task.getRelativePath()
    if (relpath !== matched.relpath) {
      matched.relpath = relpath
    }

    // If needed, update content
    content = matched.update(content)

  }), { concurrency: 1 })

  // Write file content if needed
  if (content !== initialContent) {
    debug('List as changed, write list')
    yield fs.outputFileAsync(filepath, content)
  }

  return content
})

class Matched {
  constructor (match) {
    this.raw = match[0]
    this.space = match[1]
    this.done = match[2] === '[x]' || match[2] === '[X]'
    this.label = match[3].trim()

    this.alt = '...'
    this.relpath = null
    this.id = null

    if (match[4]) {
      let checkFn = /^([a-z]+\d+).*\.md$/.exec(path.basename(match[6]))
      if (checkFn) {
        this.alt = match[5]
        this.relpath = match[6]
        this.id = normalizeId(checkFn[1])
      } else {
        this.label = match[3] + match[4]
      }
    }
    this.index = match.index
  }

  update (content) {
    let check = this.done ? '[x]' : '[ ]'
    let link = this.relpath ? ` [${this.alt}](${this.relpath})` : ''
    let line = `${this.space}- ${check} ${this.label}${link}`
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
