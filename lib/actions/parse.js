'use strict'
const co = require('bluebird-co').co
const Task = require('../Task')

const parse = co.wrap(function * (filepath, options) {
  let task = yield Task.open(filepath)
  return task.toJSON({flat: true})
})

parse.help = 'Parse one task file and return a stask json object'

module.exports = parse
