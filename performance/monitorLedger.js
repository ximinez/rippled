var functions = require('./functions');

var remotes = functions.remotes;
var prefix = functions.prefix;
var config = functions.config;

var monitorLedger = functions.monitorLedger;
var reconnectOnDisconnectMulti = functions.reconnectOnDisconnectMulti;

// Default start time value in case it doesn't get set
var start = new Date();
function date() {
  var diff = new Date() - start;
  return functions.date().trim() + ' ' + diff + 'ms ';
}

// update the start time
start = new Date();

function reconnectOnIdle(remote, timeout) {
  var timeoutHandle;

  function _reconnectTimeout() {
    timeoutHandle = setTimeout(
      function() {
        console.log(date() + 'No ledgers in ' + timeout + '. Reconnect.');
        remote.reconnect();
      }, timeout);
  }

  _reconnectTimeout();

  remote.on('disconnect',
    function() {
      console.log(date() + 'Disconnected. Clear ledger idle timeout.');
      clearTimeout(timeoutHandle);
      this.once('connect',
        function() {
          console.log(date() + 'Connected. Restart ledger idle timeout.');
          _reconnectTimeout();
        });
    });
  remote.on('ledger_closed',
    function() {
      console.log(date() + 'Got a ledger. Restart ledger idle timeout.');
      clearTimeout(timeoutHandle);
      _reconnectTimeout();
    });
}

remotes.forEach( function(remote) {
  remote.once('connect', function() {
    monitorLedger(this);
    var timeoutHandle = reconnectOnIdle(this, 4*60*1000);
  });

  remote.on('disconnect', function() {
    // 20 minute timeout. It takes about 15 minutes to resync.
    reconnectOnDisconnectMulti(remotes, this, 20*60*1000)
  });

  remote.connect();
});

