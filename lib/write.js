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
const yaml = require('js-yaml')
const kebabcase = require('lodash.kebabcase')
const omit = require('lodash.omit')

const write = co.wrap(function * (data) {
  let filepath = data.filepath

  let meta = yaml.safeDump(omit(data, [
    'filepath',
    'relpath',
    'label',
    'description',
    'updated'
  ]))

  let content = `\`\`\`yaml
${meta}
\`\`\`

### ${data.label}

${data.description}
`
  let newFilename = data.id + '_' + kebabcase(data.label) + '.md'
  let newFilepath = path.join(path.dirname(filepath), newFilename)
  if (newFilepath !== filepath) {
    yield fs.moveAsync(filepath, newFilepath)
    filepath = newFilepath
  }
  yield fs.outputFileAsync(filepath, content)
  return filepath
})


module.exports = write
