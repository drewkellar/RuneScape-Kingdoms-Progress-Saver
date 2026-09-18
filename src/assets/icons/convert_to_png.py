from pathlib import Path
from PIL import Image

folder = Path(__file__).parent

for webp_file in folder.glob("*.webp"):
    png_file = webp_file.with_suffix(".png")

    try:
        # Convert WEBP -> PNG
        with Image.open(webp_file) as img:
            img.save(png_file, "PNG")

        # Verify the PNG was actually created and is readable
        if png_file.exists() and png_file.stat().st_size > 0:
            with Image.open(png_file) as verify_img:
                verify_img.verify()

            # Delete original only after successful verification
            webp_file.unlink()

            print(f"Converted and deleted original: {webp_file.name}")
        else:
            print(f"ERROR: PNG was not created correctly: {webp_file.name}")

    except Exception as e:
        print(f"ERROR processing {webp_file.name}: {e}")

input("\nDone. Press Enter to close...")