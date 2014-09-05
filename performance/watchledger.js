/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var Wallet = require('ripple-lib').Wallet;
var functions = require('./functions');

var remote = functions.remote;
remote.setTrace(true);
var date = functions.date;
var getLedger = functions.getLedger;
var prefix = functions.prefix;

var events = [];
var allLedgers;

// TODO: Add a listener for updated ledger. Count the number of transactions in
// that ledger. Calculate time since last ledger. Divide to get transactions per
// second.

// ripple-lib subscribes to ledger events all on its own as soon as it
// connects, so all I need is a listener.
remote.on('ledger_closed', function onLedgerClosed(ledgerData) {
  console.log(date() + 'New ledger:' + ledgerData.ledger_index);
  //console.log(ledgerData);

  events.push(ledgerData.ledger_index);
  var ledgerReq = getLedger(ledgerData.ledger_index,
    { transactions: true, expand: true },
    function callback(ledger) {
      ledger.on('success', function fullLedger(ledger) {
        // console.log(date() + 'Ledger!');
        //console.log(ledger);
    //    console.log(prefix + 'Index: ' + ledger.ledger.ledger_index);
    //    console.log(prefix + 'Close time: ' + ledger.ledger.close_time_human);
    //    console.log(prefix + 'Num transactions: ' + ledger.ledger.transactions.length);
        
        var current = {
          ledger_index: ledger.ledger.ledger_index,
          close_time: ledger.ledger.close_time,
          close_time_human: ledger.ledger.close_time_human,
          wall_time: new Date(),
          transaction_count: ledger.ledger.transactions.length
        };
        // console.log(current);
        if( !allLedgers ) {
          allLedgers = {
            first: current.ledger_index,
            gap: current.ledger_index,
            last: current.ledger_index,
            start: current.close_time,
            numTransactions: 0,
            ledgers: {
            }
          };
          allLedgers.ledgers[current.ledger_index] = current;
        } else {
          if( current.ledger_index < allLedgers.first ) {
            // out of order. Ignore
            return;
          } else {
            if( current.ledger_index - allLedgers.last > 1 ) {
              // Some ledgers were skipped. Keep track of the gap
              console.log('Last received was ' + allLedgers.last
                + '. Moving gap tracker from ' + allLedgers.gap 
                + ' to ' + current.ledger_index);
              allLedgers.gap = current.ledger_index;
            }
            if( current.ledger_index - allLedgers.last > 0 ) {
              allLedgers.last = current.ledger_index;
            }
            allLedgers.numTransactions += current.transaction_count;

            allLedgers.ledgers[current.ledger_index] = current;

            if ( current.ledger_index == allLedgers.gap - 1 ) {
              for ( ; allLedgers.ledgers[allLedgers.gap - 1]
                ; allLedgers.gap-- ) {
                console.log('Moving gap tracker from ' + allLedgers.gap 
                  + ' to ' + allLedgers.gap - 1);
              }
            }

            var previous = allLedgers.ledgers[current.ledger_index - 1];
            console.log(date() + 'Ledger number: ' + current.ledger_index);
            if(previous) {
              //console.log('Previous');
              //console.log(previous);
              var time = (current.wall_time - previous.wall_time) / 1000;
              console.log(prefix + 'Processed ' + current.transaction_count
                + ' transactions in ' + time + ' seconds. ');
              if(time != 0) {
                console.log(prefix + ( current.transaction_count / time )
                  + ' transactions/second.');
              }
            }
            var first = allLedgers.ledgers[allLedgers.gap];
            //console.log('First');
            //console.log(first);
            var time = (current.wall_time - first.wall_time) / 1000;
            console.log(prefix + 'Overall: ' + allLedgers.numTransactions
              + ' transactions in ' + time + ' seconds.');
            if(time != 0) {
              console.log(prefix + ( allLedgers.numTransactions / time )
                + ' transactions/second.');
            }
          }
        }
      });
    });
  console.log(ledgerReq.message);
});

remote.on('disconnect', function() {
  console.log(date() + 'Disconnect');
  console.log(events);
  console.log(allLedgers);

  for(var gap = allLedgers.first; gap <= allLedgers.last; gap++)
  {
    while( gap <= allLedgers.last && !allLedgers.ledgers[gap]) {
      gap++;
    }
    var firstIndex = gap;
    var lastIndex = firstIndex;
    for( ; gap <= allLedgers.last && allLedgers.ledgers[gap]; gap++)
    {
      lastIndex = gap;
    }
    var first = allLedgers.ledgers[firstIndex];
    var last = allLedgers.ledgers[lastIndex];
    var numTransactions = 0;
    for( var i = firstIndex; i <= lastIndex; i++ ) {
      numTransactions += allLedgers.ledgers[i].transaction_count;
    }
    var time = (last.wall_time - first.wall_time) / 1000;
    console.log(prefix + 'Overall, ' + first.ledger_index 
      + '-' + last.ledger_index + ': ' + numTransactions
      + ' transactions in ' + time + ' seconds.');
    if(time != 0) {
      console.log(prefix + ( numTransactions / time )
        + ' transactions/second.');
    }
  }

  process.exit();
});
remote.connect();
