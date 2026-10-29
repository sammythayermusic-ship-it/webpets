#!/bin/sh
# CPU and RSS of the three processes behind "WebPets A.app": the webpets binary inside the bundle and
# the WebKit WebContent / GPU helpers started right after it (matched by start time, within 60 s of the
# app). Three `top` samples 2 s apart (top's first sample is a lifetime average and is dropped; the
# next three are per-interval), summed over the processes and averaged, for one visibility state.
# Usage: measure.sh <label>
label="${1:-shown}"
app_pid=$(pgrep -f "WebPets A.app/Contents/MacOS/webpets" | head -1)
if [ -z "$app_pid" ]; then echo '{"error":"app not running"}'; exit 1; fi
app_epoch=$(ps -o lstart= -p "$app_pid" | xargs -0 -I{} date -j -f "%a %b %d %T %Y" "{}" +%s 2>/dev/null)
pidargs="-pid $app_pid"; pids="$app_pid"
for p in $(pgrep -f "com.apple.WebKit.WebContent|com.apple.WebKit.GPU"); do
  ep=$(ps -o lstart= -p "$p" 2>/dev/null | xargs -0 -I{} date -j -f "%a %b %d %T %Y" "{}" +%s 2>/dev/null) || continue
  [ -z "$ep" ] && continue
  d=$((ep - app_epoch))
  if [ "$d" -ge -2 ] && [ "$d" -le 60 ]; then pidargs="$pidargs -pid $p"; pids="$pids $p"; fi
done
top -l 4 -s 2 $pidargs -stats pid,cpu,mem 2>/dev/null | awk -v label="$label" -v pids="$pids" '
  /^PID/ { sample++; next }
  sample >= 2 && $1 ~ /^[0-9]+$/ {
    cpu[sample] += $2
    m = $3; unit = substr(m, length(m)); v = m + 0
    if (unit == "K") v = v / 1024; else if (unit == "G") v = v * 1024
    mem[sample] += v
    rows = rows sprintf("{\"sample\":%d,\"pid\":%s,\"pcpu\":%s,\"rssMB\":%.1f},", sample - 1, $1, $2, v)
  }
  END {
    n = 0; tc = 0; tm = 0
    for (s = 2; s <= sample; s++) { n++; tc += cpu[s]; tm += mem[s] }
    if (n == 0) { print "{\"error\":\"no samples\"}"; exit 1 }
    sub(/,$/, "", rows)
    printf "{\"label\":\"%s\",\"pids\":\"%s\",\"cpuPercentOfOneCore\":%.1f,\"rssMB\":%.0f,\"samples\":[%s]}\n", label, pids, tc / n, tm / n, rows
  }'
