#!/bin/sh
# CPU and RSS of the three processes behind "WebPets A.app": the webpets binary inside the bundle and
# the WebKit WebContent / GPU helpers started right after it (matched by start time, within 60 s of the
# app). Three samples 2 s apart, averaged, for one visibility state. Usage: measure.sh <label>
label="${1:-shown}"
app_pid=$(pgrep -f "WebPets A.app/Contents/MacOS/webpets" | head -1)
if [ -z "$app_pid" ]; then echo '{"error":"app not running"}'; exit 1; fi
app_start=$(ps -o lstart= -p "$app_pid")
app_epoch=$(date -j -f "%a %b %d %T %Y" "$app_start" +%s)
helpers=""
for p in $(pgrep -f "com.apple.WebKit.WebContent|com.apple.WebKit.GPU"); do
  st=$(ps -o lstart= -p "$p" 2>/dev/null) || continue
  ep=$(date -j -f "%a %b %d %T %Y" "$st" +%s 2>/dev/null) || continue
  d=$((ep - app_epoch))
  if [ "$d" -ge -2 ] && [ "$d" -le 60 ]; then helpers="$helpers $p"; fi
done
pids="$app_pid$helpers"
total_cpu=0; total_rss=0; n=0
rows=""
for i in 1 2 3; do
  for p in $pids; do
    line=$(ps -axo pid=,pcpu=,rss=,etime=,command= -p "$p" | head -1)
    cpu=$(echo "$line" | awk '{print $2}'); rss=$(echo "$line" | awk '{print $3}')
    total_cpu=$(echo "$total_cpu + $cpu" | bc); total_rss=$(echo "$total_rss + $rss" | bc)
    rows="$rows{\"sample\":$i,\"pid\":$p,\"pcpu\":$cpu,\"rssKB\":$rss},"
  done
  n=$((n + 1))
  [ "$i" -lt 3 ] && sleep 2
done
cpu_avg=$(echo "scale=1; $total_cpu / $n" | bc)
rss_avg_mb=$(echo "scale=0; $total_rss / $n / 1024" | bc)
printf '{"label":"%s","pids":"%s","cpuPercentOfOneCore":%s,"rssMB":%s,"samples":[%s]}\n' "$label" "$pids" "$cpu_avg" "$rss_avg_mb" "${rows%,}"
