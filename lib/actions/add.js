'use strict'
const co = require('bluebird-co').co
const findDefaultPrefix = require('../utils').findDefaultPrefix
const listTasks = require('../utils').listTasks
const findNextId = require('../utils').findNextId
const extractMeta = require('../utils').extractMeta
const Task = require('../Task.js')

const add = co.wrap(function * (options) {
  options = Object.assign({}, { files: [] }, options || {})
  let label = (options.label ? options.label : (options.files.length ? options.files.join(' ') : 'undefined')).trim()

  let labelInfos = extractMeta(label)
  label = labelInfos.label
  let meta = Object.assign({},
    options.meta || {},
    { done: Boolean(options.done) },
    labelInfos.meta
  )

  let id = options.id
  if (!id) {
    let listing = yield listTasks()
    let ids = Object.keys(listing)
    let prefix = options.prefix || findDefaultPrefix(ids)
    id = findNextId(ids, prefix)
  }

  let task = new Task({
    id: id,
    label: labelInfos.label,
    meta: meta
  })

  yield task.write(options)

  return task
})

add.help = 'Create a new task (--prefix)'

module.exports = add
