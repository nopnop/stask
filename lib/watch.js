'use strict'
const chokidar = require('chokidar')
const path = require('path')
const parse = require('./parse')
const debug = require('debug')('stask:watch')
const through2 = require('through2')

const watch = function (notused, options) {
  let watcher = chokidar.watch(options.cwd, {})

  let outStream = through2.obj()

  watcher
    .on('add', handleFile)
    .on('change', handleFile)
    .on('unlink', handleFile)

  function handleFile (filepath) {
    if (!/^[a-z]+\d+.*\.md$/i.test(path.basename(filepath))) {
      return
    }
    return parse(filepath, options)
      .then(result => outStream.write(result))
      .catch(error => debug('Error', error))
  }

  return outStream
}

watch.help = 'Continuously watch a folder for stask changes'
module.exports = watch
