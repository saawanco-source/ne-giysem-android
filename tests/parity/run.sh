#!/bin/sh
# Web (index.html) and widget (Outfit.kt + Day.kt + Alerts.kt) must give the same outfit and warnings for the same weather and routine.
# Needs: node, javac, kotlinc (KOTLINC=path/to/kotlinc/bin/kotlinc). Fails when any case differs or Kotlin throws.
set -e
cd "$(dirname "$0")"
KOTLINC="${KOTLINC:-kotlinc}"
DATA=../../app/src/main/java/com/negiysem/app/data
N="${N:-3000}"
rm -rf build && mkdir -p build/json build/kt
javac -nowarn -d build/json $(find json-src -name '*.java')
"$KOTLINC" -nowarn "$DATA/Outfit.kt" "$DATA/Day.kt" "$DATA/Alerts.kt" Harness.kt -cp build/json -d build/kt
STDLIB="$(dirname "$(dirname "$KOTLINC")")/lib/kotlin-stdlib.jar"
fail=0
for tz in Europe/Istanbul America/New_York Asia/Tokyo; do
  seed=$(( $(date +%s) % 100000 ))
  export TZ="$tz"
  node gen.js build/cases.json "$N" "$seed"
  run_both() {
    node run-js.js build/cases.json build/js.json
    java -Duser.timezone="$tz" -cp build/kt:build/json:"$STDLIB" HarnessKt build/cases.json build/kt.json
    node compare.js build/js.json build/kt.json build/cases.json
  }
  out=$(run_both)
  # Both sides read the real clock a few seconds apart; a trip ending in exactly those seconds can differ once. Real differences repeat.
  if ! echo "$out" | grep -q "mismatches 0"; then echo "[$tz] retrying once (clock boundary?)"; out=$(run_both); fi
  echo "[$tz seed $seed] $(echo "$out" | head -1)"
  if ! echo "$out" | grep -q "mismatches 0" || ! echo "$out" | grep -q "Kotlin exceptions: 0"; then echo "$out" | head -20; fail=1; fi
done
exit $fail
