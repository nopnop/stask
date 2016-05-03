'use strict'
const co = require('bluebird-co').co
const fs = require('fs-extra-promise')
const path = require('path')
const yaml = require('js-yaml')
const debug = require('debug')('stask:parse')

const parse = co.wrap(function * (file, options) {
  // let file = options.files[0]

  if (!file) {
    throw new Error('Missing filepath')
  }

  let checkFn = /^([a-z]+\d+).*\.md$/.exec(path.basename(file))

  if (!checkFn) {
    throw new Error('Invalid filename')
  }

  let id = checkFn[1]
  let filepath = path.resolve(file)
  let relpath = path.relative(options.cwd, filepath)

  debug('#%s', relpath)

  let content = (yield fs.readFileAsync(filepath, { encoding: 'utf8' })).trim()

  let reg = /^(?:(?:```yaml|<!--\n)((?:[^\n]*|\n)*?)(?:```|-->)(?:\n+---)?\n+)?(?:#*\s*)?(.+)((?:[^\n]*|\n)*?)(?:(\-{3,}\n)((?:[^\n]*|\n)*?))?$/

  let result = reg.exec(content)

  let metaraw = result[1]
  let label = result[2]
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

  id = meta.id || id

  let data = {
    id: id,
    filepath: filepath,
    relpath: relpath,
    label: label,
    description: description !== '' ? description : null,
    meta: meta
  }

  return data
})

parse.help = 'Parse one task file and return a stask json object'

module.exports = parse
