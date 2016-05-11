'use strict'
const Promise = require('bluebird')
const co = require('bluebird-co').co
const through2 = require('through2')
const parse = require('./parse')
const debug = require('debug')('stask:read')
const sift = require('sift')
const json5 = require('json5')
const listTasks = require('../utils.js').listTasks

const read = function (options) {
  let outStream = through2.obj()

  let filter = () => true

  if (options.filter) {
    let raw = options.filter.trim()
    if (raw[0] !== '{') { raw = '{' + raw + '}' }
    filter = sift(json5.parse(raw))
  }

  co(function * () {
    let listing = yield listTasks()
    let list = Object.keys(listing).map(key => listing[key])
    yield Promise.map(list, (infos) => {
      return parse(infos.filepath)
        .then((result) => {
          if (filter(result)) {
            outStream.write(result)
          }
        })
        .catch(error => debug('Error', error))
    }, { concurrency: 1 })

    outStream.end()
  })

  return outStream
}

read.help = 'Read all task in a folder recursivly and return a ndjson stream of stask'

module.exports = read
