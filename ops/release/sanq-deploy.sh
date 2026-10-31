#!/bin/sh
# Mac thin entry. Never source a local target or SSH configuration as shell code.
set -eu
PATH=/usr/bin:/bin
export PATH
unset CDPATH
case "$0" in
    /*) SCRIPT_BASE=${0%/*}; SCRIPT_BASE=${SCRIPT_BASE:-/} ;;
    */*) SCRIPT_BASE=./${0%/*} ;;
    *) SCRIPT_BASE=. ;;
esac
SCRIPT_DIR=$(CDPATH= cd -P "$SCRIPT_BASE" && pwd -P)
exec /Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14 -I -S -B -X pycache_prefix=/dev/null "$SCRIPT_DIR/sanq_deploy.py" "$@"
