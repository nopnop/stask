'use strict'
const padstart = require('lodash.padstart')
const path = require('path')
const globby = require('globby')
const co = require('bluebird-co').co
const omit = require('lodash.omit')

exports.normalizeId = function (id) {
  let parsed = /^([a-z]+)(\d+)$/.exec(id)
  let prefix = parsed[1].toLowerCase()
  let num = parseInt(parsed[2], 10)
  return prefix + padstart(num, 4, '0')
}

exports.isValidFilename = function (filepath) {
  return /^([a-z]+\d+).*\.md$/.test(path.basename(filepath))
}

exports.filepathToId = function (filepath) {
  let checkFn = /^([a-z]+\d+).*\.md$/.exec(path.basename(filepath))
  return exports.normalizeId(checkFn[1])
}

exports.listTasks = co.wrap(function * () {
  let statCache = {}
  let paths = yield globby(['**/*.md'], {
    cwd: process.cwd(),
    stat: true,
    nodir: true,
    statCache: statCache
  })
  paths = paths.filter(filename => /^[a-z]+\d+.*\.md$/i.test(path.basename(filename)))
  let result = {}
  paths.forEach((relpath) => {
    let checkFn = /^([a-z]+\d+).*\.md$/.exec(path.basename(relpath))
    let filepath = path.join(process.cwd(), relpath)
    let id = exports.normalizeId(checkFn[1])
    let infos = {
      id: id,
      prefix: exports.getIdPrefix(id),
      index: exports.getIdIndex(id),
      filepath: filepath,
      created: statCache[filepath].ctime,
      updated: statCache[filepath].mtime
    }
    if (result[id]) {
      result[id].collide = result[id].collide || []
      result[id].collide.push(infos)
    } else {
      result[id] = infos
    }
  })
  return result
})

/**
 * Retrieve id prefix
 * @param  {string} id Task id
 * @return {string}
 */
exports.getIdPrefix = function (id) {
  return /^([a-z]+)/i.exec(id)[1]
}

/**
 * Retrieve id index
 * @param  {string} id Task id
 * @return {string}
 */
exports.getIdIndex = function (id) {
  return parseInt(/^[a-z]+(\d+)/i.exec(id)[1], 10)
}

/**
 * Retrieve the default task prefix
 * @param  {Array} ids       List of all existing ids
 * @return {String}          The most used prefix or 'task'
 */
exports.findDefaultPrefix = function (ids) {
  let prefixes = {}
  let lastSize = 0
  let prefix

  ids.forEach((id) => {
    let prefix = exports.getIdPrefix(id)
    prefixes[prefix] = (prefixes[prefix] || 0) + 1
  })

  Object.keys(prefixes).forEach((key) => {
    if (lastSize < prefixes[key]) {
      prefix = key
      lastSize = prefixes[key]
    }
  })
  return prefix || 'task'
}

/**
 * Retrieve the next id for the given prefix
 * @param  {Array} ids       List of all existing ids
 * @param  {String} [expectedPrefix] Expected prefix (else findDefaultPrefix is used)
 * @param  {Number} [delta]  Increment id by (default: 1)
 * @return {String}
 */
exports.findNextId = function (ids, expectedPrefix, delta) {
  delta = delta || 1
  expectedPrefix = expectedPrefix || exports.findDefaultPrefix(ids)
  let last = 0
  ids.forEach((id) => {
    let prefix = exports.getIdPrefix(id)
    if (prefix === expectedPrefix) {
      last = Math.max(last, exports.getIdIndex(id))
    }
  })
  return exports.normalizeId(expectedPrefix + (last + delta))
}

exports.extractMeta = function (label, defaultMeta) {
  let meta = Object.assign({}, defaultMeta || {})
  let regMeta = /(?:(?:@(\w+)\(([^\)]+)\))|(?:@(\w+))|#(\w+))\s*/g
  label = label.replace(regMeta, (match, key, value, flag, tag) => {
    if (key !== undefined) {
      meta[key] = exports.parseMetaValue(value)
    } else if (flag !== undefined) {
      meta[flag] = true
    } else if (tag !== undefined) {
      meta.tags = meta.tags || []
      meta.tags.push(tag)
    }
    return ''
  })
  return {
    label: label.trim(),
    meta: meta
  }
}

exports.parseMetaValue = function (value) {
  if (!value) {
    return value
  } else if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === 'true'
  } else if (/^\d+$/.test(value)) {
    return parseInt(value, 10)
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value)
  } else if ((new Date(value)).toString() !== 'Invalid Date') {
    return new Date(value)
  } else {
    return value
  }
}

exports.formatLine = function (infos, addMeta) {
  let check = infos.done ? '[x]' : '[ ]'
  let link = infos.relpath ? ` [${infos.alt}](${infos.relpath})` : ''
  let label = infos.label
  if (addMeta) {
    let fMetas = exports.formatMeta(omit(addMeta, ['done']))
    label = fMetas ? label + ' ' + fMetas : label
  }
  return `${infos.space}- ${check} ${label}${link}`
}

exports.formatMeta = function (metas) {
  let fMetas = []
  Object.keys(metas).forEach((key) => {
    let value = metas[key]
    if (typeof value === 'string') {
      fMetas.push(`@${key}(${value})`)
    } else if (typeof value === 'boolean') {
      if (value) {
        fMetas.push(`@${key}`)
      } else {
        fMetas.push(`@${key}(false)`)
      }
    } else if (Object.prototype.toString.call(value) === '[object Date]') {
      let sDate = value.toISOString().slice(0, 10)
      fMetas.push(`@${key}(${sDate})`)
    } else if (key === 'tags' && Array.isArray(value)) {
      value.forEach(v => fMetas.push('#' + v))
    }
  })
  return fMetas.join(' ')
}
