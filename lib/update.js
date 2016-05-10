'use strict'
const Promise = require('bluebird')
const fs = require('fs-extra-promise')
const ndjson = require('ndjson')
const co = require('bluebird-co').co
const through2 = require('through2')
const globby = require('globby')
const path = require('path')
const parse = require('./parse')
const debug = require('debug')('stask:read')

const update = co.wrap(function * (filepath, options) {
  let source = yield fs.readFileAsync(filepath, 'utf8')
  let found = []
  let match
  let reg = /^\s*\-\s\[(?:\s|x)\]\s(.*?)(\[([^\]]+)\]\(([^\)]+)\))?$/gm
  let last
  while (match = reg.exec(source)) {
    found.push(new Matched(match))
  }

  yield Promise.map(found, co.wrap(function * (matched) {
    console.log(matched.id)
  }), { concurrency: 1 })

  return found
})

class Matched {
  constructor (match) {
    this.raw = match[0]
    this.label = match[1]

    this.title = '...'
    this.relpath = null
    this.id = null

    if (match[2]) {
      let checkFn = /^([a-z]+\d+).*\.md$/.exec(path.basename(match[4]))
      if (checkFn) {
        this.title = match[3]
        this.relpath = match[4]
        this.id = checkFn[1]
      } else {
        this.label = match[1] + match[2]
      }
    }

    this.index = match.index
  }
}

update.help = 'Read tasks in a list and update related task files'

module.exports = update
