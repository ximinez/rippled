/*
 Sends transactions to configured rippled as fast as possible. 

 For even more fun, run in parallel. With a standalone rippled, use
 a shell command like:

$ num=64; rm -vf firehose*.log ; node performance/maintainLedger.js | tee maintainLedger.log & for i in $(seq 1 $num) ; do node performance/firehose.js ${i} ${num} | tee firehose${i}.log &  done

 With a network of rippleds, including multiple client handlers, use
 a shell command like:

$ num=64; clients=2; thisclient=1; rm -vf firehose*.log ; for i in $(seq 1 $num) ; do node performance/firehose.js $(( ${i} + ( ${thisclient} - 1 ) * ${num} )) $(( ${num} * ${clients} ))  | tee firehose${i}.log &  done

 Some ways of looking at the results:

$ grep -H finish firehose[0-9]*.log|sed 's/:/ /' | cut -d\  -f 1,8-9 | sort | uniq -c && grep -H Exit firehose[0-9]*.log
$ grep -H finish firehose[0-9]*.log|sed 's/:/ /' | cut -d\  -f 8-9 | sort | uniq -c && grep -H Exit firehose[0-9]*.log


 */
var firstpayment = 200;
var paymentincrement = 1; //100;

var Amount = require('ripple-lib').Amount;
var functions = require('./functions');

var remote = functions.remote;
var rootAccount = functions.rootAccount;
var prefix = functions.prefix;

var makePayment = functions.makePayment;
var roundRobinRemote = functions.roundRobinRemote;

// Default start time value in case it doesn't get set
var start = new Date();
function date() {
  var diff = new Date() - start;
  return functions.date().trim() + ' ' + diff + 'ms ';
}

var instanceNumber;
var sourceWallet;
var testWallet;
var preFundingFunction;
if(process.argv.length > 2) {
  var numberOfInstances;
  instanceNumber = Number(process.argv[2]);
  if(process.argv.length > 3) {
    numberOfInstances = Number(process.argv[3]);
  } else {
    // Seems like a reasonable guess, no?
    numberOfInstances = 20;
  }

  console.log(date() + 'I am instance number ' + instanceNumber 
    + ' out of ' + numberOfInstances);

  var wallets = functions.getGeneratedWallets();
  if(instanceNumber > wallets.length / 2) {
    throw new Error('Not enough wallets to run instance ' + instanceNumber);
  }

  sourceWallet = wallets[instanceNumber - 1];
  testWallet = wallets[wallets.length - instanceNumber];

  function gotRoot(res, next) {
    var rootBalance = res.account_data.Balance;
    console.log(date() + 'Root balance is ' + rootBalance);

    // Try to adjust the balance to account for reserve and fees
    var rootBalance = rootBalance - 200*1000000 - (20 * numberOfInstances);
    console.log(date() + 'Available root balance is ' + rootBalance);
    var amount = Math.floor(rootBalance / numberOfInstances);
    console.log(date() + 'Want to fund source account for ' + amount);
    var transaction = remote.createTransaction('Payment',
      {
        account: rootAccount.address,
        destination: sourceWallet.address,
        amount: amount
      });
    remote.setSecret(sourceWallet.address, sourceWallet.secret);

    console.log(date() + 'Fund source account for '
      + Amount.from_json(transaction.tx_json.Amount).to_human_full());
    console.log(transaction.tx_json);

    transaction.on('error', function(err) {
      // retry
      console.log(date() + 'retry initial funding: error');
      console.log(err);
      gotRoot(res, next);
    });
    transaction.on('timeout', function(err) {
      // retry
      console.log(date() + 'retry initial funding: timeout');
      console.log(err);
      gotRoot(res, next);
    });
    transaction.on('success', function(res) {
      console.log(date() + 'Transaction for '
        + Amount.from_json(transaction.tx_json.Amount).to_human_full()
        + ' finished: success');
      // console.log(res);

      // Start the _real_ timer now
      start = new Date();
      next(firstpayment);
    });

    if(!remote.isConnected()) {
      console.log(date() + 'gotRoot: Remote is disconnected. Try again later.');
      setImmediate(gotRoot, res, next);
      return;
    }

    transaction.submit();
  }

  preFundingFunction = function(next) {
    if(!remote.isConnected()) {
      console.log(date()
        + 'preFundingFunction: Remote is disconnected. Try again later.');
      setImmediate(preFundingFunction, next);
      return;
    }

    var accountinfo = functions.getAccountInfo(rootAccount.address);
    accountinfo.on('success', function(res) {
      var fundDelay = 2500 * instanceNumber;
      console.log(date() + 'Fund source account in ' + fundDelay + 'ms.');
      setTimeout( function(res, next) {
        gotRoot(res, next);
      }, fundDelay, res, next);
    });

  };
} else {
  sourceWallet = rootAccount;
  testWallet = functions.getGeneratedWallets(1)[0];

  preFundingFunction = function(next) {
    // Start the _real_ timer now
    start = new Date();
    next(firstpayment);
  }
}

remote.once('connect', function() {

  // update the start time
  start = new Date();

  function next(payment) {
    //var amount = Amount.from_human(payment + 'XRP');
    var amount = payment * 1000000;
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

    transaction.on('error', function(err) {
      console.log(date() + 'Transaction for '
        + Amount.from_json(transaction.tx_json.Amount).to_human_full()
        + ' finished: fail. ' + err.engine_result);
    });
    transaction.on('success', function(res) {
      //console.log(res);
      console.log(date() + 'Transaction for '
        + Amount.from_json(transaction.tx_json.Amount).to_human_full()
        + ' finished: success');
    });
    transaction.on('timeout', function() {
      console.log(date() + 'Transaction for '
        + Amount.from_json(transaction.tx_json.Amount).to_human_full()
        + ' finished: time out');
    });
    if(!remote.isConnected()) {
      console.log(date() + 'next: Remote is disconnected. Try again later.');
      setImmediate(next, payment);
      return;
    }
    transaction.submit();

    setImmediate(next, payment + paymentincrement);

    console.log(date() + 'END: Send transaction for '
      + Amount.from_json(transaction.tx_json.Amount).to_human_full());

  }

  preFundingFunction(next);

});

remote.on('disconnect', function() {
  console.log(date() + 'Disconnect');
  var servers = this._servers;
  for(var i = 0; i < servers.length; i++) {
    if(servers[i]._shouldConnect)
      console.log('Server ' + i + ' connection was dropped remotely.');
    else
      console.log('Server ' + i + ' was disconnected by rippled.');
  }
  setImmediate(function () {
    console.log(date() + 'Exit');
    process.exit();
  });
});

remote.connect();

