#!/usr/bin/env bash
# Assemble la vidéo : 1 segment par scène (slide PNG + voix WAV + zoom lent),
# puis concat finale. Usage : bash tools/video/build.sh
set -e
OUT="tools/video/out"
FINAL="tools/video/resumeci-nouveautes.mp4"
FPS=25
PAD=0.55

for i in 0 1 2 3 4 5 6 7; do
  ii=$(printf "%02d" "$i")
  ad=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUT/voice_$ii.wav")
  d=$(awk "BEGIN{printf \"%.2f\", $ad + $PAD}")
  fos=$(awk "BEGIN{printf \"%.2f\", $d - 0.4}")
  ffmpeg -y -loop 1 -framerate $FPS -i "$OUT/scene_$ii.png" -i "$OUT/voice_$ii.wav" \
    -vf "scale=1280:720,zoompan=z='if(eq(on,0),1.0,min(pzoom+0.00055,1.12))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':fps=$FPS:s=1280x720,fade=t=in:st=0:d=0.35,fade=t=out:st=$fos:d=0.4" \
    -af apad -t "$d" \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
    -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart \
    "$OUT/seg_$ii.mp4" 2>/dev/null
  echo "seg_$ii.mp4 — ${d}s"
done

> "$OUT/concat.txt"
for i in 0 1 2 3 4 5 6 7; do
  ii=$(printf "%02d" "$i")
  echo "file 'seg_$ii.mp4'" >> "$OUT/concat.txt"
done

ffmpeg -y -f concat -safe 0 -i "$OUT/concat.txt" -c copy -movflags +faststart "$FINAL" 2>/dev/null
ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$FINAL"
echo "DONE: $FINAL"
