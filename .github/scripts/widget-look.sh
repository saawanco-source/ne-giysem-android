#!/bin/bash
# Runs WidgetLookTest on the running emulator; pictures and the report end up in widget-look/.
# Exit code: 0 only when the test passed (nothing overlaps, sticks out or is clipped).
set -u
adb wait-for-device
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w -e class com.negiysem.app.widget.WidgetLookTest \
  com.negiysem.app.test/androidx.test.runner.AndroidJUnitRunner > instrument.txt 2>&1
tail -60 instrument.txt
mkdir -p widget-look
adb exec-out run-as com.negiysem.app tar -cf - -C /data/data/com.negiysem.app/files widget-shots > widget-look/shots.tar
tar -xf widget-look/shots.tar -C widget-look && mv widget-look/widget-shots/* widget-look/ && rmdir widget-look/widget-shots
ls widget-look | head
if [ -f widget-look/rapor.txt ]; then
  n=$(grep -c '!!' widget-look/rapor.txt || true)
  echo "Sorun sayısı: $n"
  [ "$n" -gt 0 ] && echo "::warning title=Widget görünümü::$n sorun: $(grep '!!' widget-look/rapor.txt | head -12 | sed 's/^ *!! //' | tr '\n' ';')"
fi
grep -q '^OK (' instrument.txt
