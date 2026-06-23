# Breathing Klang GIS StoryMap

Responsive, scroll-based university StoryMap for an IoT air-pollution sensor placement study in Klang, Malaysia.

## Run locally

The maps and GeoTIFF loading require an HTTP server. Node.js is available on the project machine:

```powershell
node server.cjs
```

Open `http://localhost:8000`.

## GIS raster overlays

Place the exported rasters in the project root with these exact filenames:

- `causal_raster.tif`
- `impact_raster.tif`
- `final_suitability.tif`

When a file is available, its panel status changes from **Illustrative surface** to **GeoTIFF loaded**. If the files are absent, the maps use interactive demonstration layers so the story remains fully functional.

The browser must be able to read valid georeferencing from each GeoTIFF. Use a common CRS, extent, origin and resolution for correct visual comparison.

## Files

- `index.html` - StoryMap structure and content
- `styles.css` - visual system, themes and responsive layouts
- `app.js` - Leaflet maps, layer toggles, GeoTIFF loading and page interactions
- `assets/hero-klang.png` - generated hero artwork
