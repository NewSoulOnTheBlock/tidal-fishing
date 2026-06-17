# PWA Icon Generation

To create proper PWA icons for app store submission:

1. **Design Requirements:**
   - 512x512px source image (PNG with transparency)
   - Simple, recognizable design
   - Works at small sizes
   - Represents "Tidal" fishing game

2. **Generate Icons:**
   Visit: https://realfavicongenerator.net/
   Or use: https://www.pwabuilder.com/imageGenerator

3. **Required Sizes:**
   - icon-192.png (192x192)
   - icon-512.png (512x512)
   - icon-192-maskable.png (192x192, with safe zone)
   - icon-512-maskable.png (512x512, with safe zone)

4. **Maskable Icons:**
   - Add 20% padding around main content
   - Use solid background color (#06101a)
   - Test at: https://maskable.app/

5. **Replace:**
   Place generated icons in `/public/` folder

## Current Setup
Using favicon.svg as temporary icon. Replace with PNG icons for production.
