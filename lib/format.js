'use strict'
const through2 = require('through2')

const format = function (options) {
  let outStream = through2.obj(function (obj, notused, next) {
    let checkbox = obj.done ? '[x]' : '[ ]'
    this.push(`- ${checkbox} ${obj.label} [...](./${obj.relpath})\n`)
    next()
  })
  return outStream
}

format.help = 'Format a stack ndjson stream'

module.exports = format
