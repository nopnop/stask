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
const padstart = require('lodash.padstart')
const kebabcase = require('lodash.kebabcase')

const add = co.wrap(function * (options) {
  let label = options.files.length ? options.files.join(' ') : 'undefined'

  let paths = yield globby(['**/*.md'], { cwd: options.cwd })
  paths = paths.filter(filename => /^[a-z]+\d+.*\.md$/i.test(path.basename(filename)))

  let prefixes = {}
  paths.forEach((filepath) => {
    let infos = /^([a-z]+)(\d+).*\.md$/.exec(path.basename(filepath))
    let prefix = infos[1]
    let id = parseInt(infos[2], 10)
    prefixes[prefix] = prefixes[prefix] || []
    prefixes[prefix].push(id)
  })

  let prefix = options.prefix || findDefaultPrefix(prefixes)
  let id = findNextId(prefixes, prefix)

  let filename = id + '_' + kebabcase(label) + '.md'

  let filepath = path.join(options.cwd, filename)

  let content = `\`\`\`yaml
id: ${id}
\`\`\`

### ${label}

(task description...)
`
  yield fs.outputFileAsync(filepath, content)

  return filepath
})

add.help = 'Create a new task (--prefix)'

module.exports = add

/**
 * Retrieve the default task prefix
 * @param  {Object} prefixes Prefix vs id list
 * @return {String}          The most used prefix or 'task'
 */
function findDefaultPrefix (prefixes) {
  let prefix
  let lastSize = 0
  Object.keys(prefixes).forEach((key) => {
    if (lastSize < prefixes[key].length) {
      prefix = key
      lastSize = prefixes[key].length
    }
  })
  return prefix || 'task'
}

/**
 * Retrieve the next id for the given prefix
 * @param  {Object} prefixes Prefix vs id list
 * @param  {String} prefix   Expected prefix
 * @return {String}
 */
function findNextId (prefixes, prefix) {
  let last = (prefixes[prefix] || [0]).sort().pop()
  return prefix + padstart(last + 1, 4, '0')
}
