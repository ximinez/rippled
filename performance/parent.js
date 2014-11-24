var functions = require('./functions');
var child_process = require('child_process');

var date = functions.date;

console.log(date() + 'PARENT fork');
var child = child_process.fork(__dirname + '/workerProc.js'
  );
  //, [], { silent: true });

console.log(date() + 'PARENT on message');
child.on('message', function(m) {
  console.log(date() + 'PARENT got message:', m);
});

console.log(date() + 'PARENT send message');
child.send( { request: 'I want something' } );

console.log(date() + 'PARENT set exit timeout');
setTimeout(
  function() {
    console.log(date() + 'PARENT exit');
    process.exit();
  },
  20000);
