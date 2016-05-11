'use strict'
const co = require('bluebird-co').co
const listTasks = require('../utils').listTasks

const list = co.wrap(function * () {
  return listTasks()
})

list.help = 'List available tasks id vs filepath'

module.exports = list
