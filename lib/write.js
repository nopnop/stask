'use strict'
const Promise = require('bluebird')
const fs = require('fs-extra-promise')
const ndjson = require('ndjson')
const co = require('bluebird-co').co
const through2 = require('through2')
const globby = require('globby')
const path = require('path')
const parse = require('./parse')
const debug = require('debug')('stask:write')

const write = co.wrap(function * (data) {

})
