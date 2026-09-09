from pathlib import Path
from PIL import Image

MAX_SIZE = (64, 64)

EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff"
}

for file in Path.cwd().iterdir():
    if not file.is_file() or file.suffix.lower() not in EXTENSIONS:
        continue

    try:
        with Image.open(file) as img:
            width, height = img.size

            # Already within the 64x64 maximum
            if width <= 64 and height <= 64:
                print(f"Skipped: {file.name} ({width}x{height})")
                continue

            # Resize while preserving aspect ratio
            resized = img.copy()
            resized.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)

            save_args = {}

            if "exif" in img.info:
                save_args["exif"] = img.info["exif"]

            if file.suffix.lower() in {".jpg", ".jpeg"}:
                save_args["quality"] = 95
                save_args["optimize"] = True

            elif file.suffix.lower() == ".png":
                save_args["optimize"] = True

            elif file.suffix.lower() == ".webp":
                save_args["quality"] = 95
                save_args["method"] = 6

            resized.save(file, **save_args)

            print(
                f"Resized: {file.name} "
                f"{width}x{height} -> "
                f"{resized.width}x{resized.height}"
            )

    except Exception as e:
        print(f"ERROR: {file.name}: {e}")

print("Done.")