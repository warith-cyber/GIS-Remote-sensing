const KLANG_CENTER = [3.0449, 101.4456];
const KLANG_ZOOM = 11;
const EPSG3380 =
  "+proj=cass +lat_0=3.68464905 +lon_0=101.389107913889 +x_0=-34836.161 +y_0=56464.049 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs";

const dataPaths = {
  boundary: "map/Geojson/klang base.geojson",
  hospitals: "map/Geojson/hopital.geojson",
  schools: "map/Geojson/School.geojson",
  roadsSub1: "map/Geojson/roads sub1.geojson",
  roadsSub2: "map/Geojson/roads_sub2.geojson",
  industrySub1: "map/Geojson/Industrial sub1.geojson",
  industrySub2: "map/Geojson/Industrial sub2.geojson",
  sensors: "map/Geojson/IOT Sensor.geojson",
  sensorBuffers: "map/Geojson/IOT sensor buffered.geojson"
};

const rasterConfig = {
  final: {
    file: "map/Geotiff/Peta_Akhir_Scenario_2_Betul.tif",
    label: "Final suitability GeoTIFF"
  }
};

const maps = {};
const layerRegistry = {};
const dataCache = new Map();
const projectedDataCache = new Map();
let studyBounds = null;
let resultActiveLayer = "final";

function defineProjection() {
  if (typeof proj4 !== "undefined") {
    proj4.defs("EPSG:3380", EPSG3380);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceToLatLng(x, y) {
  if (typeof proj4 === "undefined") return [y, x];
  const [lng, lat] = proj4("EPSG:3380", "EPSG:4326", [x, y]);
  return [lat, lng];
}

function transformCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) return coordinates;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    const [lat, lng] = sourceToLatLng(coordinates[0], coordinates[1]);
    const next = [lng, lat];
    if (coordinates.length > 2) next.push(...coordinates.slice(2));
    return next;
  }
  return coordinates.map(transformCoordinates);
}

function transformGeometry(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map(transformGeometry)
    };
  }
  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates)
  };
}

function transformGeoJson(source) {
  const geojson = clone(source);
  delete geojson.crs;
  delete geojson.bbox;

  if (geojson.type === "FeatureCollection") {
    geojson.features = geojson.features.map((feature) => ({
      ...feature,
      geometry: transformGeometry(feature.geometry)
    }));
  } else if (geojson.type === "Feature") {
    geojson.geometry = transformGeometry(geojson.geometry);
  } else if (geojson.coordinates) {
    geojson.coordinates = transformCoordinates(geojson.coordinates);
  }

  return geojson;
}

async function fetchGeoJson(path) {
  if (!dataCache.has(path)) {
    dataCache.set(path, fetch(path, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`Could not load ${path}`);
      return response.json();
    }));
  }
  return dataCache.get(path);
}

async function loadProjectedGeoJson(path, options = {}) {
  if (!projectedDataCache.has(path)) {
    projectedDataCache.set(path, fetchGeoJson(path).then(transformGeoJson));
  }
  const projected = await projectedDataCache.get(path);
  return L.geoJSON(projected, {
    ...options,
    renderer: L.canvas({ tolerance: 0.8 })
  });
}

function firstValue(properties, keys) {
  if (!properties) return "";
  for (const key of keys) {
    const value = properties[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "";
}

function featureTitle(feature, fallback) {
  const properties = feature?.properties || {};
  return firstValue(properties, [
    "name",
    "official_n",
    "official_name",
    "amenity",
    "highway",
    "adm2_name",
    "id",
    "fid",
    "osm_id"
  ]) || fallback;
}

function bindTooltip(layer, feature, title, description) {
  const label = featureTitle(feature, title);
  layer.bindTooltip(`<b>${label}</b><br>${description}`, { sticky: true });
}

function createPointLayer(color, radius, title, description) {
  return {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius,
      color: "#ffffff",
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.96
    }),
    onEachFeature: (feature, layer) => bindTooltip(layer, feature, title, description)
  };
}

function createBaseMap(id, options = {}) {
  const map = L.map(id, {
    center: KLANG_CENTER,
    zoom: KLANG_ZOOM,
    zoomControl: false,
    scrollWheelZoom: false,
    preferCanvas: true,
    ...options
  });

  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO | source layers EPSG:3380",
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  map.on("focus", () => map.scrollWheelZoom.enable());
  map.on("blur", () => map.scrollWheelZoom.disable());
  return map;
}

async function addBoundary(map, fill = false) {
  const boundary = await loadProjectedGeoJson(dataPaths.boundary, {
    style: {
      color: "#2f7150",
      weight: 2,
      opacity: 0.95,
      fillColor: "#8bc99d",
      fillOpacity: fill ? 0.1 : 0.035,
      dashArray: "7 7"
    },
    onEachFeature: (feature, layer) => bindTooltip(
      layer,
      feature,
      "Klang District",
      "Administrative study boundary. Source CRS: EPSG:3380."
    )
  });
  boundary.addTo(map);
  if (!studyBounds) studyBounds = boundary.getBounds();
  return boundary;
}

async function addCausalLayers(map, includeControl = true, visible = true, config = {}) {
  const includeParcels = config.includeParcels !== false;
  const includeRoads = config.includeRoads !== false;
  const group = L.layerGroup();
  if (visible) group.addTo(map);

  const highwayBuffer = await loadProjectedGeoJson(dataPaths.roadsSub1, {
    style: {
      color: "#b65a55",
      weight: 9,
      opacity: 0.08,
      lineCap: "round"
    },
    onEachFeature: (feature, layer) => bindTooltip(
      layer,
      feature,
      "Major road or highway",
      "High-weight causal layer: 40 percent in the report model."
    )
  });

  const highways = await loadProjectedGeoJson(dataPaths.roadsSub1, {
    style: {
      color: "#b65a55",
      weight: 2.2,
      opacity: 0.58,
      lineCap: "round"
    },
    onEachFeature: (feature, layer) => bindTooltip(
      layer,
      feature,
      "Major road or highway",
      "High traffic and logistics emission corridor."
    )
  });

  let roads = null;
  if (includeRoads) {
    roads = await loadProjectedGeoJson(dataPaths.roadsSub2, {
      style: {
        color: "#c47772",
        weight: 1.1,
        opacity: 0.44,
        lineCap: "round"
      },
      onEachFeature: (feature, layer) => bindTooltip(
        layer,
        feature,
        "Distribution road",
        "Primary, secondary or tertiary distribution road. Weight: 25 percent."
      )
    });
  }

  const heavyIndustry = await loadProjectedGeoJson(dataPaths.industrySub1, {
    style: {
      color: "#c93e3b",
      fillColor: "#e8534f",
      fillOpacity: 0.42,
      weight: 1.1,
      opacity: 0.78
    },
    onEachFeature: (feature, layer) => bindTooltip(
      layer,
      feature,
      "Heavy industry",
      "Industrial sub1: heavy industrial source layer within the report's industrial causal factor."
    )
  });

  let lightIndustry = null;
  if (includeParcels) {
    lightIndustry = await loadProjectedGeoJson(dataPaths.industrySub2, {
      style: {
        color: "#b8742a",
        fillColor: "#f3ba63",
        fillOpacity: 0.2,
        weight: 0.4,
        opacity: 0.42
      },
      onEachFeature: (feature, layer) => bindTooltip(
        layer,
        feature,
        "Light industry",
        "Industrial sub2: light industrial land-use polygon within the report's industrial causal factor."
      )
    });
  }

  highwayBuffer.addTo(group);
  if (roads) roads.addTo(group);
  highways.addTo(group);
  if (lightIndustry) lightIndustry.addTo(group);
  heavyIndustry.addTo(group);

  if (includeControl) {
    const overlays = {
      "Highways - 40%": highways,
      "Heavy industry - sub1": heavyIndustry,
      "Road pressure buffer": highwayBuffer
    };
    if (roads) overlays["Roads - 25%"] = roads;
    if (lightIndustry) overlays["Light industry - sub2"] = lightIndustry;
    L.control.layers(null, overlays, { collapsed: true, position: "topright" }).addTo(map);
  }

  return { group, highways, roads, industrySub1: heavyIndustry, industrySub2: lightIndustry, heavyIndustry, lightIndustry, highwayBuffer };
}

async function addImpactLayers(map, includeControl = true, visible = true) {
  const group = L.layerGroup();
  if (visible) group.addTo(map);

  const hospitals = await loadProjectedGeoJson(dataPaths.hospitals, createPointLayer(
    "#d83b39",
    8,
    "Hospital",
    "Critical receptor: patients and elderly populations."
  ));

  const schools = await loadProjectedGeoJson(dataPaths.schools, createPointLayer(
    "#f2ae55",
    7,
    "School",
    "Critical receptor: children and school communities."
  ));

  const sensorBuffers = await loadProjectedGeoJson(dataPaths.sensorBuffers, {
    style: {
      color: "#64c6c4",
      fillColor: "#64c6c4",
      fillOpacity: 0.11,
      weight: 1.1,
      opacity: 0.68
    },
    onEachFeature: (feature, layer) => bindTooltip(
      layer,
      feature,
      "500 m sensor coverage buffer",
      "Engineering coverage zone used in the final deployment plan."
    )
  });

  hospitals.addTo(group);
  schools.addTo(group);
  sensorBuffers.addTo(group);

  if (includeControl) {
    L.control.layers(null, {
      Hospitals: hospitals,
      Schools: schools,
      "500 m sensor coverage": sensorBuffers
    }, { collapsed: true, position: "topright" }).addTo(map);
  }

  return { group, hospitals, schools, sensorBuffers };
}

async function addImpactRoadOverlay(map) {
  const group = L.layerGroup();

  const roadReference = await loadProjectedGeoJson(dataPaths.roadsSub2, {
    style: {
      color: "#c47772",
      weight: 0.9,
      opacity: 0.34,
      lineCap: "round"
    },
    onEachFeature: (feature, layer) => bindTooltip(
      layer,
      feature,
      "Road reference",
      "Distribution road context for nearby school and hospital exposure."
    )
  });

  const highwayReference = await loadProjectedGeoJson(dataPaths.roadsSub1, {
    style: {
      color: "#b65a55",
      weight: 1.6,
      opacity: 0.48,
      lineCap: "round"
    },
    onEachFeature: (feature, layer) => bindTooltip(
      layer,
      feature,
      "Highway reference",
      "Major road context for vulnerable receptor exposure."
    )
  });

  roadReference.addTo(group);
  highwayReference.addTo(group);
  return group;
}

async function addSensorLayers(map, includeControl = true, visible = true) {
  const group = L.layerGroup();
  if (visible) group.addTo(map);

  const sensorBuffers = await loadProjectedGeoJson(dataPaths.sensorBuffers, {
    style: {
      color: "#8bc99d",
      fillColor: "#8bc99d",
      fillOpacity: 0.13,
      weight: 1.2,
      opacity: 0.75
    },
    onEachFeature: (feature, layer) => bindTooltip(
      layer,
      feature,
      "500 m sensor buffer",
      "Coverage radius recommended by the report for micro-sensor monitoring."
    )
  });

  const sensors = await loadProjectedGeoJson(dataPaths.sensors, createPointLayer(
    "#d83b39",
    7,
    "Candidate IoT sensor",
    "Optimized sensor location selected from high-priority suitability cells."
  ));

  sensorBuffers.addTo(group);
  sensors.addTo(group);

  if (includeControl) {
    L.control.layers(null, {
      "Candidate sensors": sensors,
      "500 m coverage buffers": sensorBuffers
    }, { collapsed: true, position: "topright" }).addTo(map);
  }

  return { group, sensors, sensorBuffers };
}

function setStatus(selector, text) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = text;
  });
}

function rasterPixelColor(values) {
  if (!values || values.length === 0) return null;
  const [r, g, b, a = 255] = values;
  if ([r, g, b].some((value) => value === undefined || value === null || Number.isNaN(value))) return null;
  if (a === 0) return null;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a / 255))})`;
}

function setFinalRasterVisible(visible) {
  const raster = layerRegistry.finalRaster;
  if (!raster) return;
  const container = raster.getContainer?.() || raster._container;
  if (container) {
    container.style.display = visible ? "" : "none";
    container.style.opacity = visible ? "0.72" : "0";
  } else if (typeof raster.setOpacity === "function") {
    raster.setOpacity(visible ? 0.72 : 0);
  }
}

async function loadFinalRaster() {
  if (typeof parseGeoraster === "undefined" || typeof GeoRasterLayer === "undefined") {
    setStatus('[data-raster="final"]', "GeoTIFF plugin unavailable");
    return null;
  }

  try {
    const response = await fetch(rasterConfig.final.file, { cache: "no-store" });
    if (!response.ok) throw new Error("Raster not found");
    const georaster = await parseGeoraster(await response.arrayBuffer());
    const createLayer = () => new GeoRasterLayer({
      georaster,
      opacity: 0.72,
      resolution: 192,
      pixelValuesToColorFn: rasterPixelColor
    });

    const resultLayer = createLayer();
    layerRegistry.finalRaster = resultLayer;
    resultLayer.addTo(maps.result);
    setTimeout(() => setFinalRasterVisible(resultActiveLayer === "final"), 0);
    setStatus('[data-raster="final"]', "Final GeoTIFF loaded");
    return resultLayer;
  } catch (error) {
    setStatus('[data-raster="final"]', "Final GeoTIFF not loaded");
    document.querySelectorAll('[data-raster="final"]').forEach((element) => {
      element.title = `${rasterConfig.final.file} could not be displayed. Sensor points and buffers are still shown.`;
    });
    return null;
  }
}

function fitToStudyArea(map) {
  if (studyBounds?.isValid()) {
    map.fitBounds(studyBounds, { padding: [26, 26], animate: false });
  } else {
    map.setView(KLANG_CENTER, KLANG_ZOOM);
  }
}

function clearResultMode() {
  if (layerRegistry.resultMode) {
    layerRegistry.resultMode.forEach((layer) => {
      if (maps.result.hasLayer(layer)) maps.result.removeLayer(layer);
    });
  }
  setFinalRasterVisible(false);
  layerRegistry.resultMode = [];
}

async function showResultLayer(type) {
  resultActiveLayer = type;
  clearResultMode();

  if (type === "causal") {
    const causal = await addCausalLayers(maps.result, false, true, { includeParcels: false, includeRoads: false });
    layerRegistry.resultMode = [causal.group];
  } else if (type === "impact") {
    const impact = await addImpactLayers(maps.result, false);
    layerRegistry.resultMode = [impact.group];
  } else {
    if (!layerRegistry.resultFinalGroup) {
      const sensors = await addSensorLayers(maps.result, false);
      layerRegistry.resultFinalGroup = sensors.group;
    }
    if (!maps.result.hasLayer(layerRegistry.resultFinalGroup)) {
      layerRegistry.resultFinalGroup.addTo(maps.result);
    }
    layerRegistry.resultMode = [layerRegistry.resultFinalGroup];
    setFinalRasterVisible(true);
  }
}

async function buildMaps() {
  maps.study = createBaseMap("study-map", { zoom: 10 });
  const boundary = await addBoundary(maps.study, true);
  L.marker(KLANG_CENTER)
    .bindTooltip("Klang urban centre", { permanent: false })
    .addTo(maps.study);
  fitToStudyArea(maps.study);

  maps.causal = createBaseMap("causal-map");
  await addBoundary(maps.causal);
  layerRegistry.causal = await addCausalLayers(maps.causal);
  fitToStudyArea(maps.causal);
  setStatus('[data-raster="causal"]', "EPSG:3380 vectors loaded");

  maps.impact = createBaseMap("impact-map");
  await addBoundary(maps.impact);
  layerRegistry.impact = await addImpactLayers(maps.impact);
  layerRegistry.impactRoads = await addImpactRoadOverlay(maps.impact);
  setupImpactRoadToggle();
  fitToStudyArea(maps.impact);
  setStatus('[data-raster="impact"]', "EPSG:3380 vectors loaded");

  maps.result = createBaseMap("result-map");
  await addBoundary(maps.result);
  layerRegistry.resultSensors = await addSensorLayers(maps.result, true);
  layerRegistry.resultFinalGroup = layerRegistry.resultSensors.group;
  layerRegistry.resultMode = [layerRegistry.resultSensors.group];
  fitToStudyArea(maps.result);

  await loadFinalRaster();

  document.querySelectorAll(".map-reset").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.map.replace("-map", "");
      const map = maps[key];
      if (map) fitToStudyArea(map);
    });
  });

  setTimeout(() => Object.values(maps).forEach((map) => map.invalidateSize()), 350);
  return boundary;
}

function setupResultControls() {
  document.querySelectorAll("[data-result-layer]").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll("[data-result-layer]").forEach((item) => item.classList.toggle("active", item === button));
      await showResultLayer(button.dataset.resultLayer);
    });
  });
}

function setupFactorFocus() {
  document.querySelectorAll("[data-focus-layer]").forEach((button) => {
    button.addEventListener("click", () => {
      const layer = layerRegistry.causal?.[button.dataset.focusLayer];
      if (!layer) return;
      if (!maps.causal.hasLayer(layer)) layer.addTo(maps.causal);
      document.querySelectorAll("[data-focus-layer]").forEach((item) => item.classList.toggle("active", item === button));
      const bounds = layer.getBounds ? layer.getBounds() : null;
      if (bounds?.isValid()) maps.causal.fitBounds(bounds, { padding: [34, 34], maxZoom: 14, animate: true });
    });
  });
}

function setupImpactRoadToggle() {
  const button = document.getElementById("impact-road-toggle");
  const roadLayer = layerRegistry.impactRoads;
  if (!button || !roadLayer || button.dataset.ready === "true") return;

  button.disabled = false;
  button.dataset.ready = "true";
  button.addEventListener("click", () => {
    const isVisible = maps.impact.hasLayer(roadLayer);
    if (isVisible) {
      maps.impact.removeLayer(roadLayer);
    } else {
      roadLayer.addTo(maps.impact);
    }
    const nextVisible = !isVisible;
    button.textContent = nextVisible ? "Roads on" : "Roads off";
    button.setAttribute("aria-pressed", String(nextVisible));
  });
}

function setupTheme() {
  const root = document.documentElement;
  const button = document.getElementById("theme-toggle");
  const stored = localStorage.getItem("storymap-theme");
  if (stored) root.dataset.theme = stored;
  button.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("storymap-theme", next);
    button.setAttribute("aria-label", `Switch to ${next === "dark" ? "light" : "dark"} theme`);
  });
}

function setupNavigation() {
  const header = document.getElementById("site-header");
  const menuButton = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");
  const chapterLabel = document.getElementById("current-chapter");
  const sections = [...document.querySelectorAll("[data-chapter]")];

  window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 30), { passive: true });
  menuButton.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    document.body.classList.toggle("menu-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close chapter menu" : "Open chapter menu");
  });
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    menu.classList.remove("open");
    document.body.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
  }));

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) chapterLabel.textContent = entry.target.dataset.chapter;
    });
  }, { rootMargin: "-35% 0px -55%", threshold: 0 });
  sections.forEach((section) => sectionObserver.observe(section));
}

function setupReveal() {
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

document.addEventListener("DOMContentLoaded", async () => {
  defineProjection();
  setupTheme();
  setupNavigation();
  setupReveal();
  setupResultControls();
  setupFactorFocus();

  try {
    await buildMaps();
  } catch (error) {
    console.error(error);
    document.querySelectorAll(".raster-status").forEach((element) => {
      element.textContent = "Data load error";
      element.title = error.message;
    });
  }
});
