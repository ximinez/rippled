var async       = require("async");
var assert      = require('assert');
var Amount      = require("ripple-lib").Amount;
var Remote      = require("ripple-lib").Remote;
var Transaction = require("ripple-lib").Transaction;
var Server      = require("./server").Server;
var testutils   = require("./testutils");
var config      = testutils.init_config();

suite("Subscribe book tests", function() {
  var $ = { };

  setup(function(done) {
    testutils.build_setup().call($, done);
  });

  teardown(function(done) {
    testutils.build_teardown().call($, done);
  });

  test("offer create", function (done) {
      var self = this;
      var final_create;

      async.waterfall([
          function (callback) {
            var request = $.remote.requestSubscribe(null);
            request.addBook({
              "both" : true,
              "taker_gets" : {
                  "currency" : "USD", "issuer" : "root"
              },
              "taker_pays" : {
                  "currency" : "XRP"
              }
            }, true);
            request.addBook({
              "both" : true,
              "taker_gets" : {
                  "currency" : "XRP"
              },
              "taker_pays" : {
                  "currency" : "USD", "issuer" : "root"
              }
            }, true);
            request.once('success', function(res) {
              console.log(res);
              assert.strictEqual(0, res.asks.length);
              assert.strictEqual(0, res.bids.length);
              callback(null);
            });
            request.once('error', function(err) {
              console.log(err);
              callback(err);
            });
            $.remote.on('book', function(m) {
              console.log(m);
              done();
            });
            request.request();
          },
          function (callback) {
            $.remote.transaction()
              .offer_create("root", "500", "100/USD/root")
              .on('submitted', function (m) {
                  // console.log("PROPOSED: offer_create: %s", JSON.stringify(m));
                  callback(m.engine_result !== 'tesSUCCESS', m);
                })
              .on('final', function (m) {
                  // console.log("FINAL: offer_create: %s", JSON.stringify(m));

                  assert.strictEqual('tesSUCCESS', m.metadata.TransactionResult);

                  assert(final_create);
                  // done();
                  var request = $.remote.requestBookOffers(
                    {
                        "currency" : "USD", "issuer" : "root"
                    },
                    {
                        "currency" : "XRP"
                    });
                  request.once('success', function(res) {
                    console.log(res);
                    console.log(res.offers);
                    assert.strictEqual(1, res.offers.length);
                  });
                  request.once('error', function(err) {
                    console.log(err);
                    callback(err);
                  });
                  request.request();
                  
                  request = $.remote.requestSubscribe(null);
                  request.addBook({
                    "both" : true,
                    "taker_gets" : {
                        "currency" : "USD", "issuer" : "root"
                    },
                    "taker_pays" : {
                        "currency" : "XRP"
                    }
                  }, true);
                  request.addBook({
                    "both" : true,
                    "taker_gets" : {
                        "currency" : "XRP"
                    },
                    "taker_pays" : {
                        "currency" : "USD", "issuer" : "root"
                    }
                  }, true);
                  request.once('success', function(res) {
                    console.log(res);
                    assert.strictEqual(0, res.asks.length);
                    assert.strictEqual(0, res.bids.length);
                    callback(null);
                  });
                  request.once('error', function(err) {
                    console.log(err);
                    callback(err);
                  });
                  request.request();
                })
              .submit();
          },
          function (m, callback) {
            $.remote
              .once('ledger_closed', function (message) {
                  // console.log("LEDGER_CLOSED: %d: %s", ledger_index, ledger_hash);
                  final_create  = message;
                })
              .ledger_accept();
          }
        ], function (error) {
          // console.log("result: error=%s", error);
          assert(!error, self.what || "Unspecifide Error");

          done();
        });
  });

});

