'use strict'
const through2 = require('through2')
const formatLine = require('../utils').formatLine
const Task = require('../Task')

const format = function (options) {
  let outStream = through2.obj(function (obj, notused, next) {
    let task = new Task(obj)
    this.push(formatLine(task) + '\n')
    next()
  })
  return outStream
}

format.help = 'Format a stack ndjson stream'

module.exports = format
