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

#include <ripple/app/ledger/impl/TimeoutCounter.h>
#include <ripple/app/main/Application.h>
#include <ripple/core/JobQueue.h>
#include <ripple/overlay/Overlay.h>

namespace ripple {

using namespace std::chrono_literals;

TimeoutCounter::TimeoutCounter(
    Application& app,
    uint256 const& hash,
    std::chrono::milliseconds interval,
    QueueJobParameter&& jobParameter,
    beast::Journal journal)
    : app_(app)
    , sink_(journal, to_short_string(hash) + " ")
    , journal_(sink_)
    , hash_(hash)
    , timeouts_(0)
    , complete_(false)
    , failed_(false)
    , progress_(false)
    , timerInterval_(interval)
    , queueJobParameter_(std::move(jobParameter))
    , timer_(app_.getIOService())
{
    assert((timerInterval_ > 10ms) && (timerInterval_ < 30s));
}

void
TimeoutCounter::setTimer(ScopedLockType& sl)
{
    if (isDone())
        return;
    JLOG(journal_.debug()) << "Setting timer for " << timerInterval_.count()
                           << "ms";
    timer_.expires_after(timerInterval_);
    timer_.async_wait([wptr =
                           pmDowncast()](boost::system::error_code const& ec) {
        if (auto ptr = wptr.lock())
        {
            ScopedLockType sl(ptr->mtx_);
            if (ec == boost::asio::error::operation_aborted || ptr->skipNext_)
            {
                JLOG(ptr->journal_.debug())
                    << "Aborting setTimer: " << ec
                    << ", skip: " << (ptr->skipNext_ ? "true" : "false");
                ptr->skipNext_ = false;
                return;
            }

            ptr->queueJob(sl);
        }
    });
}

std::size_t
TimeoutCounter::cancelTimer(ScopedLockType& sl)
{
    auto const ret = timer_.cancel();
    JLOG(journal_.debug()) << "Cancelled " << ret << " timer(s)";
    return ret;
}

void
TimeoutCounter::queueJob(ScopedLockType& sl)
{
    if (isDone())
        return;
    if (queueJobParameter_.jobLimit &&
        app_.getJobQueue().getJobCountTotal(queueJobParameter_.jobType) >=
            queueJobParameter_.jobLimit)
    {
        JLOG(journal_.debug()) << "Deferring " << queueJobParameter_.jobName
                               << " timer due to load";
        setTimer(sl);
        return;
    }

    app_.getJobQueue().addJob(
        queueJobParameter_.jobType,
        queueJobParameter_.jobName,
        [wptr = pmDowncast()]() {
            if (auto sptr = wptr.lock(); sptr)
                sptr->invokeOnTimer();
        });
}

void
TimeoutCounter::invokeOnTimer()
{
    ScopedLockType sl(mtx_);

    if (isDone())
        return;

    if (!progress_)
    {
        if (deferred_)
            deferred_ = false;
        else
            ++timeouts_;
        JLOG(journal_.debug()) << "Timeout(" << timeouts_ << ") "
                               << " acquiring " << hash_;
        onTimer(false, sl);
    }
    else
    {
        progress_ = false;
        onTimer(true, sl);
    }

    if (!isDone())
        setTimer(sl);
}

void
TimeoutCounter::cancel()
{
    ScopedLockType sl(mtx_);
    if (!isDone())
    {
        failed_ = true;
        JLOG(journal_.info()) << "Cancel " << hash_;
    }
}

}  // namespace ripple
