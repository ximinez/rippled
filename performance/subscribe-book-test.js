var async       = require("async");
var Amount      = require("ripple-lib").Amount;
var Remote      = require("ripple-lib").Remote;
var Transaction = require("ripple-lib").Transaction;

var functions   = require("./functions");
var remote      = functions.remote;

remote.once('connect', function() {
      var self = this;
      var final_create;

      var $ = this;
      async.waterfall([
          function (callback) {
            var request = $.requestSubscribe(null);
            request.addBook({
              "both" : true,
              "taker_gets" : {
                  "currency" : "USD",
                  "issuer" : "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q"
              },
              "taker_pays" : {
                  "currency" : "XRP"
              }
            }, true);
            /*
            request.addBook({
              "both" : true,
              "taker_gets" : {
                  "currency" : "XRP"
              },
              "taker_pays" : {
                  "currency" : "USD", "issuer" : "root"
              }
            }, true);
            */
            request.once('success', function(res) {
              console.log('SUBSCRIBE SUCCESS', res);
              callback(null);
            });
            request.once('error', function(err) {
              console.log('SUBSCRIBE ERROR', err);
              callback(err);
            });
            $.on('transaction', function(m) {
              console.log('TRANSACTION', m);
              //done();
            });
            request.request();
          },
        ], function (error) {
          console.log("result: error=%s", error);

          // done();
        });
});

remote.on('disconnect', function() {
  console.log('DISCONNECTED');
  process.exit();
});

remote.connect();

