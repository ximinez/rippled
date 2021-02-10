#!/usr/bin/env bash
set -e

# This is a list of manual tests
# in rippled that we want to run
# ORDER matters here...sorted in approximately
# descending execution time (longest running tests at top)
declare -a manual_tests=(
    'ripple.ripple_data.reduce_relay_simulate'
    'ripple.tx.Offer_manual'
    'ripple.tx.CrossingLimits'
    'ripple.tx.PlumpBook'
    'ripple.app.Flow_manual'
    'ripple.tx.OversizeMeta'
    'ripple.consensus.DistributedValidators'
    'ripple.app.NoRippleCheckLimits'
    'ripple.ripple_data.compression'
    'ripple.NodeStore.Timing'
    'ripple.consensus.ByzantineFailureSim'
    'beast.chrono.abstract_clock'
    'beast.unit_test.print'
)
if [[ ${TRAVIS:-false} != "true" && ${GITHUB_ACTIONS:-false} != "true" ]]
then
    # these two tests cause travis CI to run out of memory.
    # TODO: investigate possible workarounds.
    manual_tests=(
        'ripple.consensus.ScaleFreeSim'
        'ripple.tx.FindOversizeCross'
        "${manual_tests[@]}"
    )
fi

echo -n "${manual_tests[@]}"