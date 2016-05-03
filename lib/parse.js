'use strict'
const co = require('bluebird-co').co
const fs = require('fs-extra-promise')
const path = require('path')


const parse = co.wrap(function * (options) {
  let file = options.files[0]

  if (!file) {
    throw new Error('Missing filepath')
  }

  let filepath = path.resolve(file)
  let relpath = path.relative(options.cwd, filepath)
  let content = (yield fs.readFileAsync(filepath, { encoding: 'utf8' })).trim()

  let reg = /^(#*\s*)?(.+)((?:[^\n]*|\n)*?)(?:(\-{3,}\n)((?:[^\n]*|\n)*?))?$/

  let result = reg.exec(content)

  let id = result[2].trim()
  let infos = result[3].trim().split('\n')
  let label = infos[0]
  let description = infos.slice(1).join('\n').trim()
  let metaraw = (result[5] || '').trim().split('\n').map((line) => {
    let result = /^\s?\-\s(\w+):(.*)$/.exec(line)
    if (!result) { return null }
    return parse.formatMeta({
      tag: result[1],
      value: result[2].trim()
    })
  }).filter(found => found)

  let data = {
    id: id,
    filepath: filepath,
    relpath: relpath,
    label: label,
    description: description !== '' ? description : null,
    meta: metaraw
  }

  return data
})

parse.formatMeta = function (meta) {
  return meta
}

parse.help = 'Parse one task file and return a stask json object'

module.exports = parse
