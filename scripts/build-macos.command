#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
repo="$PWD"
uv sync --project backend --group packaging --locked
npm ci --prefix extension
npm run build --prefix extension
uv run --project backend --group packaging --locked pyinstaller --noconfirm --distpath .data/frozen --workpath .data/pyinstaller scripts/freeze-service.spec
swift build --package-path macos --scratch-path .data/swift-build -c release
binary_dir=$(swift build --package-path macos --scratch-path .data/swift-build -c release --show-bin-path)
icon_dir="$repo/.data/macos-icon"
mkdir -p "$icon_dir/Speechify.iconset"
swift scripts/app-icon.swift "$icon_dir/icon.png"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$icon_dir/icon.png" --out "$icon_dir/Speechify.iconset/icon_${size}x${size}.png" > /dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$icon_dir/icon.png" --out "$icon_dir/Speechify.iconset/icon_${size}x${size}@2x.png" > /dev/null
done
iconutil -c icns "$icon_dir/Speechify.iconset" -o "$icon_dir/Speechify.icns"
uv run --project backend --group packaging --locked python scripts/bundle-macos.py "$binary_dir"
