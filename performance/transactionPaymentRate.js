/*
 * Sends transactions to configured rippled at a steady rate, some number
 * of transactions per second. When that number has been sent, that's a 
 * single repetition, and the number can be altered as described in
 * config. Intended to be used with a network, but will close the ledger
 * if running standalone after each repetition.
 *
 * Supports multiple servers.
 *

TODO: Update

$ num=64; rm -vf firehose*.log ; node performance/maintainLedger.js | tee maintainLedger.log & for i in $(seq 1 $num) ; do node performance/firehose.js ${i} ${num} | tee firehose${i}.log &  done

 * Some ways of looking at the results:

$ grep -H finish firehose[0-9]*.log|sed 's/:/ /' | cut -d\  -f 1,8-9 | sort | uniq -c && grep -H Exit firehose[0-9]*.log
$ grep -H finish firehose[0-9]*.log|sed 's/:/ /' | cut -d\  -f 8-9 | sort | uniq -c && grep -H Exit firehose[0-9]*.log


 */
var firstpayment = 200;
var paymentincrement = 1;

var Amount = require('ripple-lib').Amount;
var functions = require('./functions');

var remotes = functions.remotes;
var roundRobinRemote = functions.roundRobinRemote ;
var rootAccount = functions.rootAccount;
var prefix = functions.prefix;
var config = functions.config;

var makePayment = functions.makePayment;
var monitorLedger = functions.monitorLedger;
var checkForAccept = functions.checkForAccept;
var startNextTestRep = functions.startNextTestRep;
var getRemoteAddress = functions.getRemoteAddress;

// Default start time value in case it doesn't get set
var start = new Date();
function date() {
  var diff = new Date() - start;
  return functions.date().trim() + ' ' + diff + 'ms ';
}

function transactionError(transaction, err, amountText) {
  console.log(date() + 'Transaction for '
    + amountText
    + ' finished: fail. ' + err.engine_result);
  //console.log(err);
  if(err.engine_result == 'tecUNFUNDED_PAYMENT'
    && err.tx_json.Destination == testWallet.address) {
    console.log(date() + 'Swapping wallets');
    var swap = sourceWallet;
    sourceWallet = testWallet;
    testWallet = swap;
  }
}

function sendNextTx(params) {
  var functionStartTime = new Date();
  var remote = roundRobinRemote();
  if(checkForAccept(null, params, remote)) {
    // Don't wait for the ledger,go right into the next rep
    startNextTestRep(sendNextTx, params, remote);
    return;
  }
  //var amount = Amount.from_human(params.payment + 'XRP');
  var amount = params.payment * 1000000;
  var transaction = remote.createTransaction('Payment',
    {
      account: sourceWallet.address,
      destination: testWallet.address,
      amount: amount
    });

  /*
  transaction.tx_json.SigningPubKey = '';
  transaction.tx_json.TxnSignature = '';
  transaction.tx_json.hash = '';
  console.log(transaction.tx_json);
  */

  var amountText = Amount.from_json(transaction.tx_json.Amount).to_human_full();
  console.log(date() + 'Send transaction for '
    + amountText);

  transaction.once('error', function(err) {
    transactionError(this, err, amountText);
  });
//    transaction.once('success', function(res) {
//      //console.log(res);
//      console.log(date() + 'Transaction for '
//        + amountText
//        + ' finished: success');
//    });
  /*
   * Do we even care what the result is?
  transaction.once('timeout', function() {
    console.log(date() + 'Transaction for '
      + amountText
      + ' finished: time out');
    console.log(params);
    // On any individual transaction timeout, stop waiting for any others
    params.testTxnReady = params.testTxnNumber;
    setImmediate(checkForAccept, null, params);
  });
  transaction.once('proposed', function() {
    console.log(date() + 'Transaction for '
      + amountText
      + ' proposed.');
    ++params.testTxnReady;
    setImmediate(checkForAccept, null, params);
  });
  */
  if(!remote.isConnected()) {
    var address = getRemoteAddress(remote);

    console.log(date() + 'sendNextTx: Remote ' + address
      + ' is disconnected. Try again later.');
    setImmediate(sendNextTx, params);
    return;
  }
  transaction.submit();

  // No need to wait
  ++params.testTxnReady;

  ++params.txnsSent;
  ++params.testTxnNumber;
  params.payment += paymentincrement;
  if(params.payment > 1000000000) {
    params.payment = firstpayment;
  }
  // we want to do params.testSize Tx/sec, so 
  // the delay would be 1sec/params.testSize,
  // but we also needto account for the time
  // this function took to run.
  var desiredDelay = 1000 / params.testSize;
  var processingTime = new Date - functionStartTime;
  var delay = desiredDelay - processingTime;
  if(delay <= 0) {
    console.log("WARNING: expected delay of " + desiredDelay
      + "ms but it took " + processingTime
      + "ms to queue the transaction. Sending immediately.");
    delay = 0;
  } else {
    console.log(date() + "Sending next transaction in " + delay + "ms");
  }
  // Don't want to use setInterval, because the interval may change.
  setTimeout(sendNextTx, delay, params);

  console.log(date() + 'END: Send transaction for '
    + amountText);

}

var sourceWallet = rootAccount;
var testWallet = functions.getGeneratedWallets(1)[0];
remotes.forEach( function(remote) {
  remote.setSecret(testWallet.address, testWallet.secret);

  remote.once('connect', function() {

    // update the start time
    start = new Date();

    if(!this._stand_alone) {
      console.log(date() + 'Connected to a network. Will not send ledger_accept commands. Start monitoring the ledger');
      monitorLedger(this);
    }

    if (!remotes.every(
      function connected(testRemote, index, array) {
        return testRemote.isConnected();
      }
      )
      ) {
      return;
    }


    var params = config.performanceTest || {
      cycles: 25,
      startingsize: 1,
      factor: 2, 
      increment: 0,
      repetitionsPerCycle: 5,
    };
    params.testSize = params.startingsize;
    params.testCycle = 0;
    params.testRep = 0;
    params.testTxnNumber = 0;
    params.testTxnReady = 0;
    params.payment = firstpayment;
    params.monitoringLedger = true;
    sendNextTx(params);

  });

  remote.on('disconnect', function() {
    functions.reconnectOnDisconnectMulti(remotes, this, 15*60*1000);
  });

  remote.connect();
});
