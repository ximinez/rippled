#!/usr/bin/env bash
set -exu

: ${TRAVIS_BUILD_DIR:=""}
: ${VCPKG_DIR:=".vcpkg"}
: ${VCAPP_DIR:=${VCPKG_DIR}}
export VCPKG_ROOT=${VCPKG_DIR}
: ${VCPKG_DEFAULT_TRIPLET:="x64-windows-static"}

export VCPKG_DEFAULT_TRIPLET

EXE="vcpkg"
if [[ -z ${COMSPEC:-} ]]; then
    EXE="${EXE}.exe"
fi

if [[ -d "${VCAPP_DIR}" && -x "${VCAPP_DIR}/${EXE}" && -d "${VCAPP_DIR}/installed" ]] ; then
    echo "Using cached vcpkg at ${VCAPP_DIR}"
    ${VCAPP_DIR}/${EXE} list
else
    if [[ -d "${VCAPP_DIR}" ]] ; then
        rm -rf "${VCAPP_DIR}"
    fi
    git clone --branch 2019.12 https://github.com/Microsoft/vcpkg.git ${VCAPP_DIR}
    pushd ${VCAPP_DIR}
    BSARGS=()
    if [[ "$(uname)" == "Darwin" ]] ; then
        BSARGS+=(--allowAppleClang)
    fi
    if [[ -z ${COMSPEC:-} ]]; then
        chmod +x ./bootstrap-vcpkg.sh
        time ./bootstrap-vcpkg.sh "${BSARGS[@]}"
    else
        time ./bootstrap-vcpkg.bat
    fi
    popd
fi

# TODO: bring boost in this way as well ?
# NOTE: can pin specific ports to a commit/version like this:
#    git checkout <SOME COMMIT HASH> ports/boost
if [ $# -eq 0 ]; then
    echo "No extra packages specified..."
    PKGS=()
else
    PKGS=( "$@" )
fi
for LIB in "${PKGS[@]}"; do
    time ${VCAPP_DIR}/${EXE} --clean-after-build install ${LIB}
done


