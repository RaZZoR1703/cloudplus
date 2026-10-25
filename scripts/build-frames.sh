#!/bin/sh
# Turns the Pexels clips in assets-src/pexels/raw/ (not in git) into what the story page scrubs on scroll:
#   public/frames/<chapter>/0001.webp …  (1280 px wide, one cinematic grade for all)
#   public/media/hero.mp4 + hero.jpg      (the looping night-city background)
# Usage: sh scripts/build-frames.sh
set -e
FF=${FFMPEG:-ffmpeg}
SRC=assets-src/pexels/raw
OUT=public/frames
GRADE="eq=contrast=1.06:saturation=0.9,colorbalance=rs=-0.03:bs=0.04:rh=0.03:bh=-0.02"

# chapter  clip      start  length  fps  webp quality (busy footage gets less)
while read -r name clip start len fps q; do
  rm -rf "$OUT/$name" && mkdir -p "$OUT/$name"
  "$FF" -nostdin -v error -y -ss "$start" -i "$SRC/$clip.mp4" -t "$len" \
    -vf "fps=$fps,scale=1280:-2,$GRADE" -c:v libwebp -quality "$q" -compression_level 6 "$OUT/$name/%04d.webp"
  echo "$name: $(ls "$OUT/$name" | wc -l | tr -d ' ') frames, $(du -sh "$OUT/$name" | cut -f1)"
done <<EOF
roast    roast     0  9    15  62
pack     pack      0  8    15  55
forklift forklift  0  9    15  55
van      van       0  6    15  62
espresso espresso  0  4    20  62
pay      pay       2  9    15  62
store    store     0  10.8 10  48
EOF

mkdir -p public/media
"$FF" -v error -y -i "$SRC/hero.mp4" -t 12 -an -vf "scale=1600:-2,$GRADE" \
  -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -movflags +faststart public/media/hero.mp4
"$FF" -v error -y -i public/media/hero.mp4 -frames:v 1 -q:v 4 public/media/hero.jpg
echo "hero: $(du -sh public/media/hero.mp4 | cut -f1)"
