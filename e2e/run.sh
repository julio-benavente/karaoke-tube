#!/bin/zsh
# Runs scenarios in the background and writes a short summary: ./run.sh <name> <playwright args…>
S=/private/tmp/claude-501/-Users-juliobenavente-Documents-web-projects-karaoke-tube/3fa49228-5036-4ddf-856b-76866cf13bee/scratchpad
name=$1; shift
cd "$(dirname "$0")"
./node_modules/.bin/playwright test "$@" --reporter=list > $S/$name.log 2>&1
echo "EXIT $?" >> $S/$name.log
