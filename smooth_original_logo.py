import os
import shutil
from PIL import Image, ImageFilter

def smooth_original_logo(logo_path):
    if not os.path.exists(logo_path):
        print(f"Error: {logo_path} does not exist.")
        return False
        
    backup_path = logo_path + ".bak"
    if not os.path.exists(backup_path):
        print(f"Creating backup of original logo at {backup_path}...")
        shutil.copy2(logo_path, backup_path)
    else:
        print(f"Backup already exists at {backup_path}.")
        
    print(f"Opening original logo from {logo_path}...")
    img = Image.open(logo_path).convert("RGBA")
    original_size = img.size
    print(f"Original size: {original_size}")
    
    # We want to keep the exact same aspect ratio, but we can upscale the image 
    # to an ultra-high resolution first to smooth out the staircase/pixelated edges.
    # An upscale factor of 4x is perfect.
    upscale_w = original_size[0] * 4
    upscale_h = original_size[1] * 4
    
    print(f"Upscaling to {upscale_w}x{upscale_h} using BICUBIC...")
    img_upscaled = img.resize((upscale_w, upscale_h), Image.Resampling.BICUBIC)
    
    # Extract alpha channel to apply a high-res smoothing filter
    r, g, b, alpha = img_upscaled.split()
    
    # Apply Gaussian blur to the alpha channel.
    # A blur radius of 3.5 at 4x resolution produces a smooth anti-aliased edge at 1x.
    blur_radius = 3.5
    print(f"Applying Gaussian blur of radius {blur_radius} to high-res alpha channel...")
    smoothed_alpha = alpha.filter(ImageFilter.GaussianBlur(blur_radius))
    
    # Recombine channels
    img_smoothed_highres = Image.merge("RGBA", (r, g, b, smoothed_alpha))
    
    # Downscale back to original size using LANCZOS to produce a super-sampled, perfectly anti-aliased logo
    print(f"Downscaling back to {original_size[0]}x{original_size[1]} using LANCZOS...")
    final_logo = img_smoothed_highres.resize(original_size, Image.Resampling.LANCZOS)
    
    # Apply a very subtle post-processing alpha filter to ensure complete smoothness
    r, g, b, alpha = final_logo.split()
    final_alpha = alpha.filter(ImageFilter.GaussianBlur(0.4))
    final_logo = Image.merge("RGBA", (r, g, b, final_alpha))
    
    # Overwrite the original logo file
    final_logo.save(logo_path, "PNG")
    print(f"Successfully saved smoothed and anti-aliased logo to {logo_path}!")
    return True

if __name__ == "__main__":
    logo_file = r"c:\Users\rakti\personal-development\habitPro\assets\habitpro-logo-transparent-v3.png"
    smooth_original_logo(logo_file)
