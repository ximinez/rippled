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

#ifndef RIPPLE_PROTOCOL_SLEACCOUNTROOT_H_INCLUDED
#define RIPPLE_PROTOCOL_SLEACCOUNTROOT_H_INCLUDED

#include <xrpl/protocol/SLEWrapper.h>

namespace ripple {

template <class SLEPtr>
class SLEAccountRoot
    : public SLEWrapper<SLEPtr, ltACCOUNT_ROOT, SLEAccountRootFlags>
{
    using base = SLEWrapper<SLEPtr, ltACCOUNT_ROOT, SLEAccountRootFlags>;
    using base::sle_;

public:
    explicit SLEAccountRoot(SLEPtr const& sle) : base(sle)
    {
    }

    // All the accessors return a proxy if SLE is non-const, they can be used
    // for assignment.
    auto
    Account()
    {
        return sle_->at(sfAccount);
    }

    auto
    Sequence()
    {
        return sle_->at(sfSequence);
    }

    auto
    Balance()
    {
        return sle_->at(sfBalance);
    }

    XRPAmount
    BalanceXRP()
    {
        return sle_->at(sfBalance).xrp();
    }

    auto
    OwnerCount()
    {
        return sle_->at(sfOwnerCount);
    }

    auto
    PreviousTxnID()
    {
        return sle_->at(sfPreviousTxnID);
    }

    auto
    PreviousTxnLgrSeq()
    {
        return sle_->at(sfPreviousTxnLgrSeq);
    }

    auto
    AccountTxnID()
    {
        return sle_->at(~sfAccountTxnID);
    }

    auto
    RegularKey()
    {
        return sle_->at(~sfRegularKey);
    }

    auto
    EmailHash()
    {
        return sle_->at(~sfEmailHash);
    }

    auto
    WalletLocator()
    {
        return sle_->at(~sfWalletLocator);
    }

    auto
    WalletSize()
    {
        return sle_->at(~sfWalletSize);
    }

    auto
    MessageKey()
    {
        return sle_->at(~sfMessageKey);
    }

    auto
    TransferRate()
    {
        return sle_->at(~sfTransferRate);
    }

    auto
    Domain()
    {
        return sle_->at(~sfDomain);
    }

    auto
    TickSize()
    {
        return sle_->at(~sfTickSize);
    }

    auto
    TicketCount()
    {
        return sle_->at(~sfTicketCount);
    }

    auto
    NFTokenMinter()
    {
        return sle_->at(~sfNFTokenMinter);
    }

    auto
    MintedNFTokens()
    {
        // DEFAULT
        return sle_->at(~sfMintedNFTokens);
    }

    auto
    BurnedNFTokens()
    {
        // DEFAULT
        return sle_->at(~sfBurnedNFTokens);
    }

    auto
    FirstNFTokenSequence()
    {
        return sle_->at(~sfFirstNFTokenSequence);
    }

    auto
    AMMID()
    {
        return sle_->at(~sfAMMID);
    }
};

}  // namespace ripple

#endif