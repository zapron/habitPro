import os
from PIL import Image, ImageFilter, ImageOps

def smooth_logo_edges(input_path, output_path, target_canvas_size=1024, logo_percentage=0.60):
    if not os.path.exists(input_path):
        print(f"Error: Input file {input_path} does not exist.")
        return False
        
    print(f"Opening original logo from {input_path}...")
    img = Image.open(input_path).convert("RGBA")
    
    # Crop to bounding box of non-transparent content
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        print(f"Cropped logo to bounding box: {bbox} (new size: {img.size})")
        
    # We want the logo to occupy exactly logo_percentage of the target canvas size.
    # For a 1024x1024 canvas and 60%, the logo's bounding box should fit in a 614x614 box.
    final_logo_max_size = int(target_canvas_size * logo_percentage)
    
    # Calculate aspect ratio
    w, h = img.size
    aspect_ratio = w / h
    if aspect_ratio > 1:
        final_w = final_logo_max_size
        final_h = int(final_logo_max_size / aspect_ratio)
    else:
        final_h = final_logo_max_size
        final_w = int(final_logo_max_size * aspect_ratio)
        
    print(f"Target size for the logo on the final canvas: {final_w}x{final_h}")
    
    # To smoothen the edges of the 690x703 logo during scaling:
    # 1. Upscale the cropped logo to a high resolution using BICUBIC/BILINEAR (which naturally smooths out staircasing)
    upscale_factor = 4
    upscale_w = final_w * upscale_factor
    upscale_h = final_h * upscale_factor
    
    print(f"Upscaling to intermediate size: {upscale_w}x{upscale_h} using BICUBIC to smooth edges...")
    img_upscaled = img.resize((upscale_w, upscale_h), Image.Resampling.BICUBIC)
    
    # 2. Extract alpha channel and apply a Gaussian blur to smooth out the edge staircasing
    r, g, b, alpha = img_upscaled.split()
    
    # Apply blur to the alpha channel on the high-res image
    # A blur radius of 3 at high res (upscaled by 4x) corresponds to 0.75px blur at final res,
    # which is the perfect sweet spot for high-quality anti-aliasing!
    blur_radius = 4.0
    print(f"Applying Gaussian blur of radius {blur_radius} to high-res alpha channel...")
    smoothed_alpha = alpha.filter(ImageFilter.GaussianBlur(blur_radius))
    
    # Recombine channels
    img_smoothed_highres = Image.merge("RGBA", (r, g, b, smoothed_alpha))
    
    # 3. Downscale back to the final logo size using LANCZOS to produce a super-sampled, anti-aliased image
    print(f"Downscaling to final size: {final_w}x{final_h} using LANCZOS...")
    img_final_logo = img_smoothed_highres.resize((final_w, final_h), Image.Resampling.LANCZOS)
    
    # 4. Create the final transparent canvas
    canvas = Image.new("RGBA", (target_canvas_size, target_canvas_size), (0, 0, 0, 0))
    
    # Paste the final logo into the center of the canvas
    paste_x = (target_canvas_size - final_w) // 2
    paste_y = (target_canvas_size - final_h) // 2
    canvas.paste(img_final_logo, (paste_x, paste_y), img_final_logo)
    
    # 5. Apply a tiny post-downscale fractional blur to final alpha to ensure absolute edge-smoothing on all screen densities
    r, g, b, alpha = canvas.split()
    final_alpha = alpha.filter(ImageFilter.GaussianBlur(0.5))
    final_canvas = Image.merge("RGBA", (r, g, b, final_alpha))
    
    # Save the output file
    final_canvas.save(output_path, "PNG")
    print(f"Successfully generated beautifully smoothed icon at: {output_path}")
    return True

if __name__ == "__main__":
    input_file = r"c:\Users\rakti\personal-development\habitPro\assets\habitpro-logo-transparent-v3.png"
    output_file = r"c:\Users\rakti\personal-development\habitPro\assets\adaptive-icon-v3-padded.png"
    smooth_logo_edges(input_file, output_file)
