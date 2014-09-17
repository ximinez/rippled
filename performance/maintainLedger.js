var functions = require('./functions');

var remote = functions.remote;
var date = functions.date;

remote.once('connect', function() {
  setInterval(function() {
    console.log(date() + 'Ding!');
    remote.ledger_accept();
  }, 2500);
});

remote.on('disconnect', function() {
  console.log(date() + 'Disconnect');
  process.exit();
});

remote.connect();
