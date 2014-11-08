/*
 * Sends transactions to configured rippled in controlled bursts, waits
 * for them to be proposed, then closes the ledger. Once the ledger is closed,
 * sends the next burst.
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

var remote = functions.remote;
var rootAccount = functions.rootAccount;
var prefix = functions.prefix;
var config = functions.config;

var makePayment = functions.makePayment;
var acceptLedger = functions.acceptLedger;
var checkForAccept = functions.checkForAccept;

// Default start time value in case it doesn't get set
var start = new Date();
function date() {
  var diff = new Date() - start;
  return functions.date().trim() + ' ' + diff + 'ms ';
}

var sourceWallet = rootAccount;
var testWallet = functions.getGeneratedWallets(1)[0];
remote.setSecret(testWallet.address, testWallet.secret);

remote.once('connect', function() {

  // update the start time
  start = new Date();

  if(!this._stand_alone) {
    console.log(date() + "Connected to a network. Will not send ledger_accept commands.");
  }

  function next(params) {
    if(checkForAccept(next, params))
      return;
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

    console.log(date() + 'Send transaction for '
      + Amount.from_json(transaction.tx_json.Amount).to_human_full());

    transaction.once('error', function(err) {
      console.log(date() + 'Transaction for '
        + Amount.from_json(this.tx_json.Amount).to_human_full()
        + ' finished: fail. ' + err.engine_result);
      //console.log(err);
      if(err.engine_result == 'tecUNFUNDED_PAYMENT'
        && err.tx_json.Destination == testWallet.address) {
        console.log(date() + 'Swapping wallets');
        var swap = sourceWallet;
        sourceWallet = testWallet;
        testWallet = swap;
      }
    });
//    transaction.once('success', function(res) {
//      //console.log(res);
//      console.log(date() + 'Transaction for '
//        + Amount.from_json(this.tx_json.Amount).to_human_full()
//        + ' finished: success');
//    });
    transaction.once('timeout', function() {
      console.log(date() + 'Transaction for '
        + Amount.from_json(this.tx_json.Amount).to_human_full()
        + ' finished: time out');
      console.log(params);
      // On any individual transaction timeout, stop waiting for any others
      params.testTxnReady = params.testTxnNumber;
      setImmediate(checkForAccept, next, params);
    });
    transaction.once('proposed', function() {
      console.log(date() + 'Transaction for '
        + Amount.from_json(this.tx_json.Amount).to_human_full()
        + ' proposed.');
      ++params.testTxnReady;
      setImmediate(checkForAccept, next, params);
    });
    if(!remote.isConnected()) {
      console.log(date() + 'next: Remote is disconnected. Try again later.');
      setImmediate(next, params);
      return;
    }
    transaction.submit();

    ++params.testTxnNumber;
    params.payment += paymentincrement;
    if(params.payment > 1000000000) {
      params.payment = firstpayment;
    }
    setImmediate(next, params);

    console.log(date() + 'END: Send transaction for '
      + Amount.from_json(transaction.tx_json.Amount).to_human_full());

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
  next(params);

});

remote.on('disconnect', function() {
  functions.reconnectOnDisconnect(this, 15*60*1000);
});

remote.connect();

