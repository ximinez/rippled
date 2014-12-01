var functions = require('./functions');
var remotes = functions.remotes;
var roundRobinRemote = functions.roundRobinRemote;

var date = functions.date;

functions.connectRemotes();
remotes.forEach(
  function init(remote) {
    remote.on('disconnect', function() {
      functions.reconnectOnDisconnectMulti(remotes, this, 15*60*1000);
    });
  }
);

process.on('message', function(m) {
  var id = m["requestID"];
  if(m["submitTransaction"]) {
    submitTransaction(id, m["submitTransaction"]);
  }
});

function submitTransaction(id, txnParams) {
  console.log(date() + 'CHILD submitting a transaction');
  var remote = roundRobinRemote();

  var transaction = remote.createTransaction(txnParams.type,
    txnParams.details);

  console.log(date() + 'Send transaction for '
    + txnParams.text);

  transaction.once('error', function(err) {
    process.send( {
      requestID : id,
      error : err,
      submitTransaction : txnParams
    } );
  });
  transaction.once('success', function(res) {
    process.send( {
      requestID : id,
      success : res,
      submitTransaction : txnParams
    });
  });

  if(!remote.isConnected()) {
    var address = getRemoteAddress(remote);

    console.log(date() + 'submitTransaction: Remote ' + address
      + ' is disconnected. Try again later.');
    process.send({
      requestID : id,
      retry : txnParams
    });
    return;
  }
  transaction.submit();
  process.send( {
    requestID : id,
    submitted : txnParams
  } );
  console.log(date() + 'CHILD transaction submitted');
}
