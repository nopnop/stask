/* global describe it */
'use strict'
const expect = require('expect.js')
const path = require('path')
const co = require('bluebird-co').co
const Task = require('../lib/Task.js')

function fixp (filename) {
  return path.join(__dirname, '/fixtures', filename)
}

describe('stask', function () {
  describe('Task', function () {
    describe('constructor', function () {
      it('should create a default task', function () {
        let raw = {
          id: 'foo01'
        }
        let task = new Task(raw)
        expect(task.id).to.be.eql('foo0001')
      })
    })
  })
})
