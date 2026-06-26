# Breathing Klang GIS StoryMap

Responsive, scroll-based university StoryMap for an IoT air-pollution sensor placement study in Klang, Malaysia.

## Run locally

The maps and GeoTIFF loading require an HTTP server. Node.js is available on the project machine:

```powershell
node server.cjs
```

Open `http://localhost:8000`.

## GIS data

The StoryMap now reads the project data from the `map` folder:

- `map/Geojson/klang base.geojson`
- `map/Geojson/roads sub1.geojson`
- `map/Geojson/roads_sub2.geojson`
- `map/Geojson/Industrial sub1.geojson` - heavy industry
- `map/Geojson/Industrial sub2.geojson` - light industry
- `map/Geojson/hopital.geojson`
- `map/Geojson/School.geojson`
- `map/Geojson/IOT Sensor.geojson`
- `map/Geojson/IOT sensor buffered.geojson`
- `map/Geotiff/Peta_Akhir_Scenario_2_Betul.tif`

The source layers remain in EPSG:3380 (GDM2000 / Selangor Grid). The browser uses `proj4` to project the GeoJSON coordinates for Leaflet display without changing the original GIS files.

The final suitability GeoTIFF is loaded as the main result surface. The causal and impact panels use the EPSG:3380 GeoJSON layers from the report workflow.

Current AHP causal weights shown in the StoryMap:

- Heavy industry / industrial sub1: 40%
- Major roads and highways / road sub1: 30%
- Light industry / industrial sub2: 20%
- Primary and secondary roads / road sub2: 10%

## Files

- `index.html` - StoryMap structure and content
- `styles.css` - visual system, themes and responsive layouts
- `app.js` - Leaflet maps, layer toggles, GeoTIFF loading and page interactions
- `assets/hero-klang.png` - generated hero artwork
