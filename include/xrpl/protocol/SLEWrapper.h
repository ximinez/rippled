//------------------------------------------------------------------------------
/*
    This file is part of rippled: https://github.com/ripple/rippled
    Copyright (c) 2024 Ripple Labs Inc.

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

#ifndef RIPPLE_PROTOCOL_SLEWRAPPER_H_INCLUDED
#define RIPPLE_PROTOCOL_SLEWRAPPER_H_INCLUDED

#include <xrpl/protocol/STLedgerEntry.h>

namespace ripple {

// SLE may be const or non-const. Use a template to represent that.
template <class SLEPtr, LedgerEntryType type, class FlagType = void>
class SLEWrapper
{
protected:
    // May be null
    SLEPtr sle_;
    std::uint32_t const origFlags_;

    SLEWrapper(SLEPtr const& sle)
        : sle_(sle), origFlags_(sle_ ? sle_->at(sfFlags) : 0)
    {
        if (sle_ && sle_->getType() != type)
            sle_.reset();
    }

    virtual ~SLEWrapper() = default;

public:
    operator bool() const
    {
        return !!sle_;
    }

    SLEPtr
    operator*() const
    {
        return sle_;
    }

    SLEPtr
    operator->() const
    {
        return sle_;
    }

    auto
    LedgerIndex()
    {
        return sle_->at(~sfLedgerIndex);
    }

    auto
    LedgerEntryType() const
    {
        return sle_->at(sfLedgerEntryType);
    }

    std::uint32_t
    OriginalFlags() const
    {
        return origFlags_;
    }

    bool
    OrigFlagSet(FlagType flag) const
    {
        return origFlags_ & flag;
    }

    auto
    Flags()
    {
        return sle_->at(sfFlags);
    }

    auto
    Flags() const
    {
        return sle_->at(sfFlags);
    }

    bool
    IsFlagSet(FlagType flag) const
    {
        return Flags() & flag;
    }

    void
    SetFlag(FlagType flag, bool set = true)
    {
        // ValueProxy does not support |= or &= flags
        std::uint32_t const uFlagsIn = Flags();
        if (set)
            Flags() = uFlagsIn | flag;
        else
            Flags() = uFlagsIn & ~flag;
    }

    void
    ClearFlag(FlagType flag)
    {
        SetFlag(flag, false);
    }
};

}  // namespace ripple

#endif