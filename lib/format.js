'use strict'
const through2 = require('through2')
const path = require('path')

const format = function (options) {
  let outStream = through2.obj(function (obj, notused, next) {
    let relpath = path.relative(options.cwd, obj.filepath)
    let checkbox = obj.meta.done ? '[x]' : '[ ]'
    this.push(`- ${checkbox} ${obj.label} [...](./${relpath})\n`)
    next()
  })
  return outStream
}

format.help = 'Format a stack ndjson stream'

module.exports = format
