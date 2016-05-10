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
const sift = require('sift')
const json5 = require('json5')

const read = function (folder, options) {
  // let folder = options.files[0]
  let outStream = through2.obj()

  let filter = () => true

  if (options.filter) {
    let raw = options.filter.trim()
    if (raw[0] !== '{') { raw = '{' + raw + '}' }
    filter = sift(json5.parse(raw))
  }

  co(function * () {
    let paths = yield globby(['**/*.md'], {
      cwd: options.cwd
    })

    paths = paths.filter(filename => /^[a-z]+\d+.*\.md$/i.test(path.basename(filename)))

    yield Promise.map(paths, (relfile) => {
      let filepath = path.join(options.cwd, relfile)
      return parse(filepath, options)
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
