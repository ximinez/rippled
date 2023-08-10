//------------------------------------------------------------------------------
/*
    This file is part of rippled: https://github.com/ripple/rippled
    Copyright (c) 2012, 2013 Ripple Labs Inc.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose  with  or without fee is hereby granted, provided that the above
    copyright notice and this permission notice appear in all copies.

    THE  SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH  REGARD  TO  THIS  SOFTWARE  INCLUDING  ALL  IMPLIED  WARRANTIES  OF
    MERCHANTABILITY  AND  FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY  SPECIAL ,  DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER  RESULTING  FROM  LOSS  OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION  OF  CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/
//==============================================================================

#include <ripple/app/ledger/LedgerMaster.h>
#include <ripple/app/main/Application.h>
#include <ripple/app/misc/HashRouter.h>
#include <ripple/app/misc/Transaction.h>
#include <ripple/app/rdb/backend/PostgresDatabase.h>
#include <ripple/app/rdb/backend/SQLiteDatabase.h>
#include <ripple/app/tx/apply.h>
#include <ripple/basics/Log.h>
#include <ripple/basics/safe_cast.h>
#include <ripple/core/DatabaseCon.h>
#include <ripple/core/Pg.h>
#include <ripple/json/json_reader.h>
#include <ripple/protocol/ErrorCodes.h>
#include <ripple/protocol/Feature.h>
#include <ripple/protocol/jss.h>

namespace ripple {

Transaction::Transaction(
    std::shared_ptr<STTx const> const& tx,
    boost::optional<std::string> const& status,
    std::uint32_t ledgerSeq)
    : Transaction(
          tx,
          (status) ? safe_cast<TransStatus>((*status)[0]) : INVALID,
          ledgerSeq)
{
    assert(status_ == INVALID || status_ == COMMITTED);
}

Transaction::Transaction(
    std::shared_ptr<STTx const> const& tx,
    TransStatus status,
    std::uint32_t ledgerSeq) noexcept
    : ledger_(ledgerSeq), status_(status), tx_(tx)
{
}

std::variant<
    std::pair<std::shared_ptr<Transaction>, std::shared_ptr<TxMeta>>,
    TxSearched>
Transaction::load(uint256 const& id, Application& app, error_code_i& ec)
{
    return load(id, app, std::nullopt, ec);
}

std::variant<
    std::pair<std::shared_ptr<Transaction>, std::shared_ptr<TxMeta>>,
    TxSearched>
Transaction::load(
    uint256 const& id,
    Application& app,
    ClosedInterval<uint32_t> const& range,
    error_code_i& ec)
{
    using op = std::optional<ClosedInterval<uint32_t>>;

    return load(id, app, op{range}, ec);
}

Transaction::Locator
Transaction::locate(uint256 const& id, Application& app)
{
    auto const db =
        dynamic_cast<PostgresDatabase*>(&app.getRelationalDatabase());

    if (!db)
    {
        Throw<std::runtime_error>("Failed to get relational database");
    }

    return db->locateTransaction(id);
}

std::variant<
    std::pair<std::shared_ptr<Transaction>, std::shared_ptr<TxMeta>>,
    TxSearched>
Transaction::load(
    uint256 const& id,
    Application& app,
    std::optional<ClosedInterval<uint32_t>> const& range,
    error_code_i& ec)
{
    auto const db = dynamic_cast<SQLiteDatabase*>(&app.getRelationalDatabase());

    if (!db)
    {
        Throw<std::runtime_error>("Failed to get relational database");
    }

    return db->getTransaction(id, range, ec);
}

// options 1 to include the date of the transaction
Json::Value
Transaction::getJson(Application& app, JsonOptions options, bool binary) const
{
    Json::Value ret(tx_->getJson(JsonOptions::none, binary));

    if (ledger_)
    {
        ret[jss::inLedger] = ledger_;  // Deprecated.
        ret[jss::ledger_index] = ledger_;

        if (options == JsonOptions::include_date)
        {
            auto ct = app.getLedgerMaster().getCloseTimeBySeq(ledger_);
            if (ct)
                ret[jss::date] = ct->time_since_epoch().count();
        }
    }

    return ret;
}

}  // namespace ripple
