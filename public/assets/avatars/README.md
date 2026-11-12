# NEXORA raster sprite catalog

This is the artwork contract for independently composited transparent character parts.

PNG convention:
- transparent RGBA PNG, 2x resolution master;
- body/head parts aligned to a shared 180x300 logical canvas;
- sprite sheets use columns for frames and rows in this order: front, back, left, right;
- animation frame counts/FPS are declared in `public/nexora-sprite-avatar.js`;
- optimize for mobile while keeping PNG as the source format.

Initial manifest slots:
- heads/head-01.png … head-03.png
- bodies/body-slim.png, body-classic.png, body-athletic.png
- hair/hair-short.png, hair-long.png, hair-curly.png
- outfits/outfit-casual.png, outfit-jacket.png
- shoes/shoes-sneakers.png, shoes-boots.png
- accessories/glasses.png, halo.png, wings.png

The renderer is a progressive enhancement API. Existing SVG avatars remain active until illustrated PNG assets are added, so missing art cannot blank existing characters.
