/*
 * This is strictly intended to be a code generator.
 *
 * Usage: node performance/generateFundingTransactions.js > performance/fundingTransactions.sh
 *
 * Accounts can then be funded on a fresh standalone server with
 * sh performance/fundingTransactions.sh
 */
var Transaction = require('ripple-lib').Transaction;
var Amount = require('ripple-lib').Amount;
var functions = require(__dirname + '/functions');

var rootAccount = functions.rootAccount;
var errorHandler = functions.errorHandler;
var wallets = functions.getGeneratedWallets();

function date() {
  return '# ' + functions.date().trim() + ' ';
}

function generate(wallets) {
  var fundingmin = 300;
  var fundingmax = 10000;

  // Assume an empty ledger, and hope the sequence numbers work.
  var sequence = 0;
  for(var i = 0; i < wallets.length; i++) {
    var wallet = wallets[i];
    // doesn't need to be cryptographically secure
    var funding = Math.floor(Math.random() * ( fundingmax - fundingmin )) 
      + fundingmin;
    var transaction = new Transaction();
    delete transaction.remote;
    transaction.tx_json = {
      Account : rootAccount.address,
      Amount : Amount.from_human(funding + 'XRP').to_json(),
      Destination : wallet.address,
      Fee: '10',
      Flags: 0,
      Sequence : ++sequence,
      TransactionType: 'Payment',
    };
    transaction._secret = rootAccount.secret;
    transaction.complete();
    transaction.sign();

    var res = {
      tx_blob : transaction.serialize().to_hex(),
      tx_json : transaction.tx_json,
    };

    console.log(date());
    console.log(': <<TXN' + i);
    console.log(res);
    console.log('TXN' + i);
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
      + requestJson + '\' http://localhost:15005');

  }

  console.log('curl -H \'Content-Type: application/json\' -X POST '
    + '-d \'{ "method": "ledger_accept" }\' http://localhost:15005');
}

generate(wallets);
