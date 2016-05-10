'use strict'
const padstart = require('lodash.padstart')
const path = require('path')

exports.normalizeId = function (id) {
  let parsed = /^([a-z]+)(\d+)$/.exec(id)
  let prefix = parsed[1].toLowerCase()
  let num = parseInt(parsed[2], 10)
  return prefix + padstart(num, 4, '0')
}

exports.filepathToId = function (filepath) {
  let checkFn = /^([a-z]+\d+).*\.md$/.exec(path.basename(filepath))
  return exports.normalizeId(checkFn[1])
}
