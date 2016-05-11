'use strict'
const co = require('bluebird-co').co
const findDefaultPrefix = require('../utils').findDefaultPrefix
const listTasks = require('../utils').listTasks
const findNextId = require('../utils').findNextId
const Task = require('../Task.js')

const add = co.wrap(function * (options) {
  let label = (options.label ? options.label : (options.files.length ? options.files.join(' ') : 'undefined')).trim()

  let listing = yield listTasks()
  let ids = Object.keys(listing)
  let prefix = options.prefix || findDefaultPrefix(ids)
  let id = findNextId(ids, prefix)

  let task = new Task({
    id: id,
    label: label
  })

  yield task.write()
})

add.help = 'Create a new task (--prefix)'

module.exports = add
