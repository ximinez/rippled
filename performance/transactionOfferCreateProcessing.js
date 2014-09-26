/*
 * Sends OfferCreate (and OfferCancel?) transactions to configured
 * rippled in controlled bursts, waits
 * for them to be proposed, then closes the ledger. Once the ledger is closed,
 * sends the next burst.
 *

TODO: Update

$ num=64; rm -vf firehose*.log ; node performance/maintainLedger.js | tee maintainLedger.log & for i in $(seq 1 $num) ; do node performance/firehose.js ${i} ${num} | tee firehose${i}.log &  done

 * Some ways of looking at the results:

$ grep -H finish firehose[0-9]*.log|sed 's/:/ /' | cut -d\  -f 1,8-9 | sort | uniq -c && grep -H Exit firehose[0-9]*.log
$ grep -H finish firehose[0-9]*.log|sed 's/:/ /' | cut -d\  -f 8-9 | sort | uniq -c && grep -H Exit firehose[0-9]*.log


 */

var fundingReserve = 200;
var firstpayment = 1;
var paymentincrement = 1;

var Amount = require('ripple-lib').Amount;
var functions = require('./functions');

var remote = functions.remote;
var rootAccount = functions.rootAccount;
var tradeCurrencies = functions.tradeCurrencies.filter(
  function notXRP(item, index, array) {
    return item != 'XRP';
  }
);
var prefix = functions.prefix;
var config = functions.config;

var makePayment = functions.makePayment;
var checkForAccept = functions.checkForAccept;


// Default start time value in case it doesn't get set
var start = new Date();
function date() {
  var diff = new Date() - start;
  return functions.date().trim() + ' ' + diff + 'ms ';
}

var sourceWallet = rootAccount;
var testWallets = functions.getGeneratedWallets().slice(0, 10000);
testWallets.forEach(
  function setSecret(testWallet, index, array) {
    remote.setSecret(testWallet.address, testWallet.secret);
  }
);

function fundWallet(wallet, next, params) {
  var amount = fundingReserve * 1000000;
  var transaction = remote.createTransaction('Payment',
    {
      account: sourceWallet.address,
      destination: wallet.address,
      amount: amount
    });

  console.log(date() + 'Send Payment transaction for '
    + Amount.from_json(transaction.tx_json.Amount).to_human_full()
    + ' to ' + wallet.address);

  var timeoutHandle = setTimeout(function() {
      setImmediate(next, params);
    }, 10000);
  transaction.once('error', function(err) {
    clearTimeout(timeoutHandle);
    console.log(date() + 'Payment Transaction for '
      + Amount.from_json(this.tx_json.Amount).to_human_full()
      + ' finished: fail. ' + err.engine_result);
    // Try funding again next time this one comes up
    wallet.funded = 0;
    setImmediate(next, params);
  });
  transaction.once('success', function(res) {
    clearTimeout(timeoutHandle);
    //console.log(res);
    //console.log(date() + 'Payment Transaction for '
      //+ Amount.from_json(this.tx_json.Amount).to_human_full()
      //+ ' finished: success');
    wallet.funded = 1;
  });
  transaction.once('timeout', function() {
    clearTimeout(timeoutHandle);
    console.log(date() + 'Payment Transaction for '
      + Amount.from_json(this.tx_json.Amount).to_human_full()
      + ' finished: time out');
    console.log(params);
    // Try funding again next time this one comes up
    wallet.funded = 0;
    setImmediate(next, params);
  });
  transaction.once('proposed', function() {
    clearTimeout(timeoutHandle);
    console.log(date() + 'Payment Transaction for '
      + Amount.from_json(this.tx_json.Amount).to_human_full()
      + ' proposed.');
    wallet.funded = 1;
    setImmediate(next, params);
  });
  if(!remote.isConnected()) {
    clearTimeout(timeoutHandle);
    console.log(date() + 'next: Remote is disconnected. Try again later.');
    remote.once('connect', function() {
      setImmediate(next, params);
    });
    return;
  }
  transaction.submit();
}

function offerCreate(payment, next, params) {
  //var amount = Amount.from_human(params.payment + 'XRP');
  var action = 'OfferCreate';

  var sellAmount = 1000000;
  var currencyIndex = payment % tradeCurrencies.length;
  var currency = tradeCurrencies[currencyIndex];
  var accountIndex = payment % testWallets.length;
  var wallet = testWallets[accountIndex];
  var account = wallet.address;

  if(!wallet.funded) {
    fundWallet(wallet, next, params);
    return null;
  }

  var buyAmount = payment + "/" + currency + "/" + account;
  var transaction = remote.createTransaction(action,
    {
      account: sourceWallet.address,
      buy: buyAmount,
      sell: sellAmount
    });

  /*
  transaction.tx_json.SigningPubKey = '';
  transaction.tx_json.TxnSignature = '';
  transaction.tx_json.hash = '';
  console.log(transaction.tx_json);
  */

  transaction.clientLabel = action + ' transaction buy '
    + Amount.from_json(transaction.tx_json.TakerPays).to_human_full()
    + ' for '
    + Amount.from_json(transaction.tx_json.TakerGets).to_human_full();
  return transaction;
}

function offerCancel(sequence, next, params) {
  var action = 'OfferCancel';
  var transaction = remote.createTransaction(action,
    {
      account: sourceWallet.address,
      sequence: sequence,
    });

  transaction.clientLabel = action + ' transaction cancel '
    + transaction.tx_json.OfferSequence;

  return transaction;
}

function makeOffer(next, params) {
  var payment = params.payment;
  var limit = 100;
  var rate = 2;
  if( payment < limit ) {
    return offerCreate(payment, next, params);
  } else {
    payment -= limit;
    var mod = payment % rate; 
    var cancel = mod == 0;
    if(cancel) {
      payment = payment / rate + 1;
      return offerCancel(payment, next, params);
    } else {
      payment = limit + ( payment - mod ) / rate + ( mod - 1 );
      return offerCreate(payment, next, params);
    }
  }
}

remote.once('connect', function() {

  // update the start time
  start = new Date();

  function next(params) {
    if(checkForAccept(next, params))
      return;
    var transaction = makeOffer(next, params);

    if(transaction) {
      console.log(date() + 'Send ' + transaction.clientLabel);

      transaction.once('error', function(err) {
        console.log(date() + 'Finished: fail. ' + err.engine_result 
          + this.clientLabel);
        ++params.testTxnReady;
        console.log(err);
      });
    //    transaction.once('success', function(res) {
    //      //console.log(res);
    //      console.log(date() + 'Finished: success. '
    //        + this.clientLabel);
    //    });
      transaction.once('timeout', function() {
        console.log(date() + 'Finished: time out. '
          + this.clientLabel);
        //console.log(params);
        // On any individual transaction timeout, stop waiting for any others
        params.testTxnReady = params.testTxnNumber;
        setImmediate(checkForAccept, next, params);
      });
      transaction.once('proposed', function() {
        console.log(date() + 'Proposed. '
          + this.clientLabel);
        ++params.testTxnReady;
        setImmediate(checkForAccept, next, params);
      });
      if(!remote.isConnected()) {
        console.log(date() + 'next: Remote is disconnected. Try again later.');
        remote.once('connect', function() {
          setImmediate(next, params);
        });
        return;
      }
      transaction.submit();

      ++params.testTxnNumber;
      params.payment += paymentincrement;
      if(params.payment > 1000000000) {
        params.payment = firstpayment;
      }
      setImmediate(next, params);

      console.log(date() + 'END: Send ' + transaction.clientLabel);
    }
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
  functions.reconnectOnDisconnect(this);
});

remote.connect();

