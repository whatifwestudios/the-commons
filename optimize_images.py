#!/usr/bin/env python3
"""
Image optimization script for The Commons building graphics.
Resizes and compresses PNG files to web-friendly sizes.
"""

import os
from PIL import Image
import argparse

def optimize_image(input_path, output_path, target_size=64, quality=85):
    """
    Optimize a single image file.
    
    Args:
        input_path: Path to input image
        output_path: Path to save optimized image
        target_size: Target width/height in pixels
        quality: JPEG quality (not used for PNG but affects processing)
    """
    try:
        with Image.open(input_path) as img:
            # Convert to RGBA if not already (preserves transparency)
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # Resize to target size while maintaining aspect ratio
            img.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
            
            # Create a new image with the exact target size and transparent background
            optimized = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
            
            # Center the image
            x = (target_size - img.width) // 2
            y = (target_size - img.height) // 2
            optimized.paste(img, (x, y), img)
            
            # Save with PNG optimization
            optimized.save(output_path, 'PNG', optimize=True)
            
            # Get file sizes
            original_size = os.path.getsize(input_path)
            new_size = os.path.getsize(output_path)
            reduction = (1 - new_size / original_size) * 100
            
            print(f"✓ {os.path.basename(input_path)}: {original_size//1024}KB → {new_size//1024}KB ({reduction:.1f}% reduction)")
            
    except Exception as e:
        print(f"✗ Error processing {input_path}: {e}")

def main():
    parser = argparse.ArgumentParser(description='Optimize building graphics for The Commons')
    parser.add_argument('input_dir', help='Directory containing PNG files to optimize')
    parser.add_argument('--output-dir', help='Output directory (default: input_dir/optimized)')
    parser.add_argument('--size', type=int, default=96, help='Target size in pixels (default: 96, recommended for zoom compatibility)')
    parser.add_argument('--recursive', '-r', action='store_true', help='Process subdirectories')
    
    args = parser.parse_args()
    
    input_dir = args.input_dir
    output_dir = args.output_dir or os.path.join(input_dir, 'optimized')
    
    if not os.path.exists(input_dir):
        print(f"Error: Input directory '{input_dir}' not found")
        return
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Process files
    total_original = 0
    total_optimized = 0
    processed = 0
    
    for root, dirs, files in os.walk(input_dir):
        if not args.recursive and root != input_dir:
            continue
            
        for filename in files:
            if filename.lower().endswith('.png'):
                input_path = os.path.join(root, filename)
                
                # Maintain directory structure in output
                rel_path = os.path.relpath(root, input_dir)
                out_dir = os.path.join(output_dir, rel_path) if rel_path != '.' else output_dir
                os.makedirs(out_dir, exist_ok=True)
                
                output_path = os.path.join(out_dir, filename)
                
                original_size = os.path.getsize(input_path)
                optimize_image(input_path, output_path, args.size)
                
                if os.path.exists(output_path):
                    new_size = os.path.getsize(output_path)
                    total_original += original_size
                    total_optimized += new_size
                    processed += 1
    
    if processed > 0:
        total_reduction = (1 - total_optimized / total_original) * 100
        print(f"\n🎉 Optimized {processed} images:")
        print(f"   Total size: {total_original//1024//1024}MB → {total_optimized//1024//1024}MB")
        print(f"   Reduction: {total_reduction:.1f}%")
        print(f"   Output: {output_dir}")
    else:
        print("No PNG files found to process")

if __name__ == '__main__':
    main()