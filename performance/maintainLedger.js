var functions = require('./functions');

var remote = functions.remote;
var date = functions.date;
var prefix = functions.prefix;

var acceptLedger = functions.acceptLedger;

remote.once('connect', function() {
  setInterval(function() {
    console.log(date() + 'Ding!');
    acceptLedger();
  }, 2500);
});

remote.on('disconnect', function() {
  console.log(date() + 'Disconnect');
  process.exit();
});

remote.connect();
