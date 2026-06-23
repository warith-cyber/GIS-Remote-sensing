const KLANG_CENTER = [3.0449, 101.4456];
const KLANG_ZOOM = 11;

const demoData = {
  boundary: {
    type: "Feature",
    properties: { name: "Klang study boundary" },
    geometry: {
      type: "Polygon",
      coordinates: [[[101.302, 3.165], [101.56, 3.17], [101.592, 3.083], [101.563, 2.955], [101.455, 2.91], [101.337, 2.934], [101.272, 3.03], [101.302, 3.165]]]
    }
  },
  roads: [
    [[3.157, 101.38], [3.104, 101.405], [3.044, 101.445], [2.986, 101.488], [2.943, 101.535]],
    [[3.096, 101.31], [3.075, 101.37], [3.047, 101.445], [3.026, 101.536]],
    [[2.985, 101.324], [3.018, 101.387], [3.063, 101.475], [3.103, 101.56]]
  ],
  secondaryRoads: [
    [[3.13,101.335],[3.09,101.46],[3.12,101.55]],
    [[2.95,101.37],[3.02,101.42],[3.08,101.51]],
    [[3.04,101.33],[3.00,101.46],[2.97,101.54]]
  ],
  industry: [
    [[101.31,3.028],[101.377,3.041],[101.397,2.989],[101.329,2.969]],
    [[101.453,3.083],[101.514,3.099],[101.535,3.054],[101.474,3.034]],
    [[101.365,3.131],[101.418,3.139],[101.431,3.101],[101.38,3.09]]
  ],
  transport: [[3.005,101.349,"Port Klang"],[3.026,101.384,"Freight terminal"],[3.064,101.454,"Klang station"],[3.09,101.54,"Logistics hub"]],
  hospitals: [[3.043,101.445,"Hospital Tengku Ampuan Rahimah"],[3.084,101.43,"Hospital district cluster"],[2.999,101.426,"Community clinic"]],
  schools: [[3.07,101.458,"School cluster"],[3.027,101.473,"School cluster"],[3.102,101.401,"School cluster"],[2.976,101.506,"School cluster"]],
  residential: [[3.058,101.48,"Central Klang residences"],[3.105,101.45,"North Klang residences"],[3.011,101.525,"South-east residences"],[3.025,101.402,"Port-side residences"]],
  parks: [[3.072,101.425,"Urban park"],[3.014,101.462,"Open-space buffer"]],
  hotspots: {
    causal: [[3.025,101.37,2700],[3.067,101.475,2500],[3.105,101.405,2100],[3.005,101.49,1900]],
    impact: [[3.045,101.447,2400],[3.075,101.463,2100],[3.02,101.51,2300],[3.102,101.42,1900]],
    final: [[3.04,101.43,1900],[3.064,101.476,1700],[3.018,101.505,1750],[3.094,101.418,1450]]
  }
};

const rasterConfig = {
  causal: { file: "causal_raster.tif", colors: ["#f4d35e", "#ef8b50", "#d83b39"] },
  impact: { file: "impact_raster.tif", colors: ["#82c5a5", "#f2b45d", "#e7604e"] },
  final: { file: "final_suitability.tif", colors: ["#65a98c", "#f0ad52", "#d83b39"] }
};

const maps = {};
const layerRegistry = {};
let resultActiveLayer = "final";

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
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);
  map.on("focus", () => map.scrollWheelZoom.enable());
  map.on("blur", () => map.scrollWheelZoom.disable());
  return map;
}

function addBoundary(map, fill = false) {
  return L.geoJSON(demoData.boundary, {
    style: {
      color: "#2f7150",
      weight: 2,
      opacity: 0.95,
      fillColor: "#8bc99d",
      fillOpacity: fill ? 0.1 : 0.03,
      dashArray: "7 7"
    }
  }).bindTooltip("Klang study boundary", { sticky: true }).addTo(map);
}

function addCausalLayers(map, includeLabels = true) {
  const group = L.layerGroup().addTo(map);
  const majorRoads = L.layerGroup();
  demoData.roads.forEach((line, index) => {
    L.polyline(line, { color: "#d83b39", weight: 4, opacity: 0.85 })
      .bindTooltip(`Primary road ${index + 1}: high traffic pressure`, { sticky: true })
      .addTo(majorRoads);
  });
  majorRoads.addTo(group);

  const secondaryRoads = L.layerGroup();
  demoData.secondaryRoads.forEach((line) => {
    L.polyline(line, { color: "#e8a64d", weight: 2, opacity: 0.75 })
      .bindTooltip("Secondary road: moderate traffic pressure", { sticky: true })
      .addTo(secondaryRoads);
  });
  secondaryRoads.addTo(group);

  const industry = L.layerGroup();
  demoData.industry.forEach((coordinates, index) => {
    L.polygon(coordinates.map(([lng, lat]) => [lat, lng]), { color: "#c93e3b", fillColor: "#e8534f", fillOpacity: 0.33, weight: 1.5 })
      .bindTooltip(`Industrial zone ${index + 1}: high source score`, { sticky: true })
      .addTo(industry);
  });
  industry.addTo(group);

  const transport = L.layerGroup();
  demoData.transport.forEach(([lat, lng, name]) => {
    L.circleMarker([lat, lng], { radius: 6, color: "#126b70", fillColor: "#64c6c4", fillOpacity: 0.95, weight: 2 })
      .bindTooltip(`${name}: transport emission factor`, { direction: "top" })
      .addTo(transport);
  });
  transport.addTo(group);

  if (includeLabels) {
    L.control.layers(null, {
      "Primary roads": majorRoads,
      "Secondary roads": secondaryRoads,
      "Industrial zones": industry,
      "Transport infrastructure": transport
    }, { collapsed: true, position: "topright" }).addTo(map);
  }
  return { group, majorRoads, secondaryRoads, industry, transport };
}

function addVulnerabilityLayers(map, includeControl = true) {
  const group = L.layerGroup().addTo(map);
  const configs = [
    ["hospitals", demoData.hospitals, "#d83b39", 10, "Hospital: very high vulnerability"],
    ["schools", demoData.schools, "#e6a646", 8, "School: high child vulnerability"],
    ["residential", demoData.residential, "#31a7aa", 11, "Residential area: population exposure"],
    ["parks", demoData.parks, "#55a875", 16, "Park: lower vulnerability buffer"]
  ];
  const layers = {};
  configs.forEach(([key, points, color, radius, label]) => {
    const layer = L.layerGroup();
    points.forEach(([lat, lng, name]) => {
      L.circle([lat, lng], { radius: radius * 95, color, fillColor: color, fillOpacity: key === "parks" ? 0.12 : 0.25, weight: 1.5 })
        .bindTooltip(`<b>${name}</b><br>${label}`, { direction: "top" })
        .addTo(layer);
    });
    layer.addTo(group);
    layers[key] = layer;
  });
  if (includeControl) {
    L.control.layers(null, {
      Hospitals: layers.hospitals,
      Schools: layers.schools,
      Residential: layers.residential,
      "Park buffers": layers.parks
    }, { collapsed: true, position: "topright" }).addTo(map);
  }
  return { group, ...layers };
}

function addHotspots(map, type, opacity = 0.3) {
  const palettes = {
    causal: ["#f2b04f", "#e8534f"],
    impact: ["#ed9853", "#d83b39"],
    final: ["#f2ae55", "#d83b39"]
  };
  const group = L.layerGroup();
  demoData.hotspots[type].forEach(([lat, lng, radius], index) => {
    const color = palettes[type][index % 2];
    L.circle([lat, lng], { radius, stroke: false, fillColor: color, fillOpacity: opacity * 0.32 }).addTo(group);
    L.circle([lat, lng], { radius: radius * 0.55, stroke: false, fillColor: color, fillOpacity: opacity * 0.55 })
      .bindTooltip(`${type === "final" ? "High sensor suitability" : type === "causal" ? "Elevated source pressure" : "Elevated human vulnerability"}`, { sticky: true })
      .addTo(group);
  });
  group.addTo(map);
  return group;
}

function buildMaps() {
  maps.study = createBaseMap("study-map", { zoom: 10 });
  addBoundary(maps.study, true);
  L.marker(KLANG_CENTER).bindTooltip("Klang urban centre", { permanent: false }).addTo(maps.study);
  maps.study.fitBounds([[2.91, 101.27], [3.17, 101.59]], { padding: [28, 28] });

  maps.causal = createBaseMap("causal-map");
  addBoundary(maps.causal);
  layerRegistry.causal = addCausalLayers(maps.causal);
  layerRegistry.causal.hotspots = addHotspots(maps.causal, "causal", 0.55);

  maps.impact = createBaseMap("impact-map");
  addBoundary(maps.impact);
  layerRegistry.impact = addVulnerabilityLayers(maps.impact);
  layerRegistry.impact.hotspots = addHotspots(maps.impact, "impact", 0.5);

  maps.result = createBaseMap("result-map");
  addBoundary(maps.result);
  showResultDemoLayer("final");

  document.querySelectorAll(".map-reset").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.map.replace("-map", "");
      const map = maps[key];
      if (map) map.setView(KLANG_CENTER, key === "study" ? 10 : KLANG_ZOOM, { animate: true });
    });
  });

  setTimeout(() => Object.values(maps).forEach((map) => map.invalidateSize()), 300);
}

function showResultDemoLayer(type) {
  const map = maps.result;
  if (layerRegistry.resultDemo) {
    layerRegistry.resultDemo.forEach((layer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
  }
  if (type === "causal") {
    layerRegistry.resultDemo = [addHotspots(map, "causal", 0.65), addCausalLayers(map, false).group];
  } else if (type === "impact") {
    layerRegistry.resultDemo = [addHotspots(map, "impact", 0.6), addVulnerabilityLayers(map, false).group];
  } else {
    const finalGroup = addHotspots(map, "final", 0.85);
    demoData.hotspots.final.forEach(([lat, lng], index) => {
      L.circleMarker([lat, lng], { radius: 7, color: "#fff", fillColor: "#d83b39", fillOpacity: 1, weight: 2 })
        .bindTooltip(`<b>Candidate sensor ${index + 1}</b><br>High combined suitability`, { direction: "top" })
        .addTo(finalGroup);
    });
    layerRegistry.resultDemo = [finalGroup];
  }
}

function interpolateColor(value, min, max, colors) {
  const ratio = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (ratio < 0.5) return colors[0];
  if (ratio < 0.78) return colors[1];
  return colors[2];
}

async function loadRaster(type) {
  if (typeof parseGeoraster === "undefined" || typeof GeoRasterLayer === "undefined") return;
  const config = rasterConfig[type];
  try {
    const response = await fetch(config.file, { cache: "no-store" });
    if (!response.ok) throw new Error("Raster not found");
    const georaster = await parseGeoraster(await response.arrayBuffer());
    const min = georaster.mins[0];
    const max = georaster.maxs[0];
    const createLayer = () => new GeoRasterLayer({
        georaster,
        opacity: 0.72,
        resolution: 192,
        pixelValuesToColorFn: (values) => {
          const value = values[0];
          if (value === undefined || value === null || Number.isNaN(value) || value === georaster.noDataValue) return null;
          return interpolateColor(value, min, max, config.colors);
        }
      });
    const resultLayer = createLayer();
    layerRegistry[`${type}ResultRaster`] = resultLayer;
    if (type === "causal" || type === "impact") {
      const detailLayer = createLayer();
      layerRegistry[`${type}Raster`] = detailLayer;
      detailLayer.addTo(type === "causal" ? maps.causal : maps.impact);
    }
    if (resultActiveLayer === type) resultLayer.addTo(maps.result);
    document.querySelectorAll(`[data-raster="${type}"]`).forEach((el) => { el.textContent = "GeoTIFF loaded"; });
  } catch (error) {
    document.querySelectorAll(`[data-raster="${type}"]`).forEach((el) => { el.title = `Add ${config.file} to the project root to replace the illustrative surface.`; });
  }
}

function setupResultControls() {
  document.querySelectorAll("[data-result-layer]").forEach((button) => {
    button.addEventListener("click", () => {
      resultActiveLayer = button.dataset.resultLayer;
      document.querySelectorAll("[data-result-layer]").forEach((item) => item.classList.toggle("active", item === button));
      ["causal", "impact", "final"].forEach((type) => {
        const raster = layerRegistry[`${type}ResultRaster`];
        if (raster && maps.result.hasLayer(raster)) maps.result.removeLayer(raster);
      });
      showResultDemoLayer(resultActiveLayer);
      const raster = layerRegistry[`${resultActiveLayer}ResultRaster`];
      if (raster) raster.addTo(maps.result);
    });
  });
}

function setupFactorFocus() {
  document.querySelectorAll("[data-focus-layer]").forEach((button) => {
    button.addEventListener("click", () => {
      const layer = layerRegistry.causal[button.dataset.focusLayer];
      if (!maps.causal.hasLayer(layer)) layer.addTo(maps.causal);
      document.querySelectorAll("[data-focus-layer]").forEach((item) => item.classList.toggle("active", item === button));
      const bounds = layer.getBounds ? layer.getBounds() : null;
      if (bounds?.isValid()) maps.causal.fitBounds(bounds, { padding: [40, 40], maxZoom: 12, animate: true });
    });
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

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setupNavigation();
  setupReveal();
  buildMaps();
  setupResultControls();
  setupFactorFocus();
  Object.keys(rasterConfig).forEach(loadRaster);
});
