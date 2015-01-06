var async       = require("async");
var Amount      = require("ripple-lib").Amount;
var Remote      = require("ripple-lib").Remote;
var Transaction = require("ripple-lib").Transaction;

var functions   = require("./functions");
var remote      = functions.remote;

remote.once('connect', function() {
      var self = this;
      var final_create;

      async.waterfall([
          function (callback) {
            var request = this.requestSubscribe(null);
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
              console.log(res);
              callback(null);
            });
            request.once('error', function(err) {
              console.log(err);
              callback(err);
            });
            this.on('book', function(m) {
              console.log(m);
              done();
            });
            request.request();
          },
        ], function (error) {
          // console.log("result: error=%s", error);

          done();
        });
});

remote.on('disconnect', function() {
  process.exit();
}

remote.connect();

