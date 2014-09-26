/*
 * This is strictly intended to be a code generator.
 *
 * Usage: node performance/generateRandomTransactions.js > performance/randomTransactions.sh
 *
 * Accounts can then be funded on a fresh standalone server with
 * bash performance/randomTransactions.sh
 */
var Transaction = require('ripple-lib').Transaction;
var Amount = require('ripple-lib').Amount;
var functions = require(__dirname + '/functions');

var errorHandler = functions.errorHandler;
var config = functions.config;
var wallets = functions.getGeneratedWallets();

function date() {
  return '# ' + functions.date().trim() + ' ';
}

function generateExponential(wallets) {
  var length = wallets.length;
  var paymentmin = 1;
  var paymentmax = 1000;

  var params = config.performanceTest || {
    cycles: 25,
    startingsize: 1,
    factor: 2,
    repetitionsPerCycle: 3,
  };

  var testSize = params.startingsize;
  var outfileName = 'rpc-output.' + Date.now() + '.log';

  // Assume each account in wallets is freshly created, and has not sent
  // any transactions itself. i.e. All sequence numbers are 1.
  var overallTxnNum = 0;
  for(var cycle = 0; cycle < params.cycles; ++cycle) {
    for(var rep = 0; rep < params.repetitionsPerCycle ; ++rep) {
      console.log('repstart=$SECONDS');
      for(var txn = 0; txn < testSize; ++txn) {
        // doesn't need to be cryptographically secure
        // Note that we could potentially pick the same src and dest account.
        // That possibility is left intentionally to exercise the temREDUNDANT
        // case
        var srcIndex = Math.floor(Math.random() * length);
        var src = wallets[srcIndex];
        var destIndex = Math.floor(Math.random() * length);
        var dest = wallets[destIndex]

        var payment = Math.floor(Math.random() * ( paymentmax - paymentmin )) 
          + paymentmin;
        var amount = Amount.from_human(payment + 'XRP');

        console.log(date() + 'Payment from wallet ' + srcIndex + ': ' + src
          + ' to wallet ' + destIndex + ': ' + dest
          + ' for ' + amount.to_human_full());

        if(!src.sequence)
          src.sequence = 0;

        var transaction = new Transaction();
        delete transaction.remote;
        transaction.tx_json = {
          Account : src.address,
          Amount : amount.to_json(),
          Destination : dest.address,
          Fee: '10',
          Flags: 0,
          Sequence : ++src.sequence,
          TransactionType: 'Payment',
        };
        transaction._secret = src.secret;
        transaction.complete();
        transaction.sign();

        var res = {
          tx_blob : transaction.serialize().to_hex(),
          tx_json : transaction.tx_json,
        };

        console.log(date());
        console.log(': <<TXN' + ++overallTxnNum);
        console.log(res);
        console.log('TXN' + overallTxnNum);
        /*
         curl -H 'Content-Type: application/json' -X POST -d '
          {
             "method" : "submit", 
             "params" : [ {
                  "secret" : “ssss”,
                  "tx_json":{
                    "TransactionType" : "Payment",
                    "Account" : "rNrX7L41GnnNFXSJrKPr4nuzRhpuX9BK7B",
                    "Destination" : "rwyxXB3hEvUHhjo6NUJ2SFcWJfmciBQ1rt",
                    "DestinationTag" : "1",
                    "Amount" : "1"
                }
              } ]
          }' http://localhost:5005
          curl -X POST -d '{ "method" : "ledger", "params" : [ { "ledger" : 8306476, "transactions" : "true", "expand" : "true" } ] }'
        */
        var requestJson = '{ "method": "submit", "params" : [ { "tx_blob" : "'
          + res.tx_blob + '" } ] }';
        console.log('curl -H \'Content-Type: application/json\' -X POST -d \''
          + requestJson + '\' http://localhost:15005'
          + ' -s -S -o ' + outfileName);

      }
      console.log('repend=$SECONDS');
      console.log('echo submitted ' + testSize + ' transactions in'
        + ' $(( $repend - $repstart )) seconds');

      console.log('ledgerstart=$SECONDS');
      console.log('time curl -H \'Content-Type: application/json\' -X POST'
        + ' -d \'{ "method": "ledger_accept" }\' http://localhost:15005'
        + ' -s -S -o ' + outfileName);
      console.log('ledgerend=$SECONDS');
      console.log('echo ledger_accept for ' + testSize
        + ' transactions finished in'
        + ' $(( $ledgerend - $ledgerstart )) seconds');

    }

    // Cycle is complete. Alter test size for the next one
    testSize *= params.factor;
  }
}

generateExponential(wallets);
