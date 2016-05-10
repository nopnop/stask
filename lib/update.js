'use strict'
const Promise = require('bluebird')
const fs = require('fs-extra-promise')
const ndjson = require('ndjson')
const co = require('bluebird-co').co
const through2 = require('through2')
const globby = require('globby')
const path = require('path')
const parse = require('./parse')
const debug = require('debug')('stask:update')
const list = require('./list')
const normalizeId = require('./utils').normalizeId
const filepathToId = require('./utils').filepathToId
const add = require('./add')
const write = require('./write')

const update = co.wrap(function * (filepath, options) {
  let content = yield fs.readFileAsync(filepath, 'utf8')
  let stats = yield fs.statAsync(filepath)
  let listing = yield list(options)

  let source = {
    content: content,
    updated: stats.mtime
  }

  let found = []
  let match
  let reg = /^(\s*)\-\s(\[(?:\s|x|X)\])\s(.*?)(\[([^\]]+)\]\(([^\)]+)\))?$/gm
  let last
  while ((match = reg.exec(source.content))) {
    let matched = new Matched(match, source)
    found.push(matched)
    if (last) {
      last.next = matched
    }
    last = matched
  }

  let doneId = []

  yield Promise.map(found, co.wrap(function * (matched) {
    if (!matched.id || !listing[matched.id]) {
      let createdFilepath = yield add({label: matched.label, cwd: options.cwd})
      let newId = filepathToId(createdFilepath)
      listing[newId] = createdFilepath
      matched.id = newId
      matched.relpath = './' + path.relative(options.cwd, createdFilepath)
    }

    source.content = matched.update(source.content)
    let filepath = listing[matched.id]
    let parsed = yield parse(filepath, options)
    console.log(matched.id, source.updated, parsed.updated)

    if (source.updated < parsed.updated) {
      console.log('  List is older')
      matched.label = parsed.label
      matched.done = parsed.done
    } else {
      console.log('  List is younger')
      parsed.label = matched.label
      parsed.done = matched.done
      let newFilepath = yield write(parsed)
      matched.relpath = './' + path.relative(options.cwd, newFilepath)
    }

    doneId.push(matched.id)
  }), { concurrency: 1 })

  yield fs.outputFileAsync(filepath, source.content)
  console.log(source.content)
  // return found
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
    while (next = next.next) { next.index += delta }

    return content
  }
}

update.help = 'Read tasks in a list and update related task files'

module.exports = update
