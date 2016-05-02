/* jshint undef: false, unused: false */

var stask = (process.env.COVERAGE ? require('../lib-cov/stask.js') : require('../lib/stask.js'));
var expect = require('expect.js');
var join   = require('path').join;


function fixp(filename) {
  return join(__dirname, '/fixtures', filename);
}

describe('stask', function(){
  it('should be tested ...')
})
