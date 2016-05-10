'use strict'
const co = require('bluebird-co').co
const path = require('path')
const globby = require('globby')
const normalizeId = require('./utils').normalizeId
// const debug = require('debug')('stask:list')

const list = co.wrap(function * (options) {
  let paths = yield globby(['**/*.md'], {
    cwd: options.cwd
  })
  paths = paths.filter(filename => /^[a-z]+\d+.*\.md$/i.test(path.basename(filename)))
  let result = {}
  paths.forEach((filepath) => {
    let checkFn = /^([a-z]+\d+).*\.md$/.exec(path.basename(filepath))
    result[normalizeId(checkFn[1])] = path.relative(options.cwd, filepath)
  })
  return result
})

list.help = 'List available tasks id vs filepath'

module.exports = list
