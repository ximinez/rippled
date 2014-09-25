var functions = require(__dirname + '/functions');

var remotes = functions.remotes;
var rootAccount = functions.rootAccount;
var roundRobinRemote = functions.roundRobinRemote;
var errorHandler = functions.errorHandler;
var makeInitialFundingTransaction = functions.makeInitialFundingTransaction;
var wallets = functions.getGeneratedWallets();

function date() {
  return '# ' + functions.date().trim() + ' ';
}

var waitingToConnect = remotes.length;
var waitingToDisconnect = 0;
console.log(date() + 'Waiting on ' + waitingToConnect + ' remotes to connect');
for(var i = 0; i < remotes.length; ++i) {
  remotes[i].connect();
  remotes[i].once('connect', function onConnect() {
    --waitingToConnect;
    ++waitingToDisconnect;
    console.log(date() + 'Waiting on ' + waitingToConnect + ' remotes to connect');
    if( waitingToConnect <= 0 ) {
      generate(remotes, wallets);
    }
  });
  remotes[i].once('disconnect', function onDisconnect() {
    --waitingToDisconnect;
    console.log(date() + 'Waiting on ' + waitingToDisconnect
      + ' remotes to disconnect');
    if(waitingToDisconnect <= 0) {
      console.log(date() + 'Done');
      process.exit();
    }
  });
}

function generate(remotes, wallets) {
  var fundingmin = 300;
  var fundingmax = 10000;

  var waitingForSign = wallets.length;
  // Assume an empty ledger, and hope the sequence numbers work.
  var sequence = 1;
  for(var i = 0; i < wallets.length; i++) {
    var wallet = wallets[i];
    var transaction = makeInitialFundingTransaction(wallet.address, 
      fundingmin, fundingmax);
    transaction.tx_json.Sequence = ++sequence;

    var signRequest = roundRobinRemote().request(
      'sign',
      rootAccount.secret,
      transaction.tx_json
    );
    signRequest.on('error', errorHandler);
    signRequest.on('success', function onSigned(res) {
      console.log(date() + 'success');
      console.log(': <<TXN' + waitingForSign);
      console.log(res);
      console.log('TXN' + waitingForSign);
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
      var requestJson = '{ "method": "submit", "params" : [ { "tx_blob" : '
        + res.tx_blob + '" } ] }';
      console.log('curl -H \'Content-Type: application/json\' -X POST -d \''
        + requestJson + '\' http://localhost:15005');

      --waitingForSign;
      console.log(date() + 'Waiting on ' + waitingForSign + ' signatures');
      if(waitingForSign <= 0) {
        for(var i = 0; i < remotes.length; ++i) {
          remotes[i].disconnect();
        }
      }
    });

    signRequest.request();
  }
}

