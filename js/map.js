const map = L.map('map', {
    center: [-48.42, -68.63],
    zoom: 6,
    zoomControl: false
});

L.control.zoom({ position: 'topright' }).addTo(map);

const argenmapLayer = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
    attribution: '',
    minZoom: 2,
    maxZoom: 19
});

const argenmapGrisLayer = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/mapabase_gris@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
    attribution: '',
    minZoom: 2,
    maxZoom: 19
});

const argenmapTopoLayer = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/mapabase_topo@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
    attribution: '',
    minZoom: 2,
    maxZoom: 19
});

const argenmapOscuroLayer = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/argenmap_oscuro@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
    attribution: '',
    minZoom: 2,
    maxZoom: 19
});

const satelitalLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '',
    minZoom: 2,
    maxZoom: 19
});

const baseLayers = {
    'Argenmap': argenmapLayer,
    'Argenmap (gris)': argenmapGrisLayer,
    'Argenmap (topográfico)': argenmapTopoLayer,
    'Argenmap (oscuro)': argenmapOscuroLayer,
    'Satelital': satelitalLayer
};

argenmapLayer.addTo(map);
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution('<a href="https://cap.santacruz.gob.ar/" target="_blank" rel="noopener noreferrer">Consejo Agrario Provincial Santa Cruz</a> | <a href="https://cartosantacruz.github.io/Soporte/" target="_blank" rel="noopener noreferrer">Soporte</a>');

const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const closeSidebar = document.getElementById('close-sidebar');
const layerList = document.getElementById('layer-list');
const layerSearch = document.getElementById('layer-search');
const hideSidebarBtn = document.getElementById('hide-sidebar-btn');
const baseMapBtn = document.getElementById('base-map-btn');
const addLayerBtn = document.getElementById('add-layer-btn');
const baseMapSelector = document.getElementById('base-map-selector');
const fileInput = document.getElementById('file-input');
const activeLayers = {};
const pendingWfsRequests = new Map();
const layerTransparency = new Map();

function getLayerTransparency(name) {
    return layerTransparency.has(name) ? layerTransparency.get(name) : 1;
}

function setLayerTransparency(name, opacity) {
    layerTransparency.set(name, opacity);
    updateLayerOpacity(name, opacity);
}

function cacheOriginalStyles(layer) {
    if (!layer || typeof layer.eachLayer !== 'function') return;
    layer.eachLayer((child) => {
        if (child && typeof child.setStyle === 'function') {
            child.options._origOpacity = child.options._origOpacity ?? (child.options.opacity ?? 1);
            child.options._origFillOpacity = child.options._origFillOpacity ?? (child.options.fillOpacity ?? child.options._origOpacity ?? 1);
        }
    });
}

function updateLayerOpacity(name, opacity) {
    const layer = activeLayers[name];
    if (!layer || typeof layer.eachLayer !== 'function') return;

    layer.eachLayer((child) => {
        if (child && typeof child.setStyle === 'function') {
            const baseOpacity = child.options._origOpacity ?? (child.options.opacity ?? 1);
            const baseFillOpacity = child.options._origFillOpacity ?? (child.options.fillOpacity ?? baseOpacity);

            const style = {
                opacity: baseOpacity * opacity
            };
            if (child.options.fillOpacity !== undefined || child.options._origFillOpacity !== undefined) {
                style.fillOpacity = baseFillOpacity * opacity;
            }
            child.setStyle(style);
        }
    });
}

let currentBaseLayer = argenmapLayer;
let currentBaseLayerName = 'Argenmap';

menuToggle.addEventListener('click', () => sidebar.classList.add('active'));
closeSidebar.addEventListener('click', () => sidebar.classList.remove('active'));
hideSidebarBtn?.addEventListener('click', () => sidebar.classList.remove('active'));
baseMapBtn?.addEventListener('click', () => {
    const open = baseMapSelector?.classList.toggle('open');
    if (baseMapSelector) {
        layerList.classList.toggle('hidden', open);
    }
});
addLayerBtn?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', handleFileInput);

layerSearch?.addEventListener('input', () => {
    renderLayerList(layerSearch.value);
});

function setBaseLayer(name) {
    if (!baseLayers[name] || currentBaseLayerName === name) return;
    if (map.hasLayer(currentBaseLayer)) {
        map.removeLayer(currentBaseLayer);
    }
    currentBaseLayer = baseLayers[name];
    currentBaseLayerName = name;
    currentBaseLayer.addTo(map);
    renderBaseMapOptions();
}

function renderBaseMapOptions() {
    if (!baseMapSelector) return;
    baseMapSelector.innerHTML = '';
    Object.keys(baseLayers).forEach((name) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'base-map-option' + (name === currentBaseLayerName ? ' active' : '');
        option.innerHTML = `<span>${name}</span><span>${name === currentBaseLayerName ? '✓' : ''}</span>`;
        option.addEventListener('click', () => {
            setBaseLayer(name);
        });
        baseMapSelector.appendChild(option);
    });
}

async function handleFileInput(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const extension = file.name.split('.').pop().toLowerCase();
        let geojson;

        if (extension === 'geojson' || extension === 'json') {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.type === 'Topology' && window.topojson) {
                const objectName = Object.keys(data.objects || {})[0];
                geojson = topojson.feature(data, data.objects[objectName]);
            } else {
                geojson = data;
            }
        } else if (extension === 'kml' || extension === 'gpx') {
            const text = await file.text();
            const xml = new DOMParser().parseFromString(text, 'application/xml');
            geojson = extension === 'kml' ? toGeoJSON.kml(xml) : toGeoJSON.gpx(xml);
        } else if (extension === 'wkt' || extension === 'txt') {
            const text = await file.text();
            if (!window.wellknown) throw new Error('Biblioteca WKT no disponible');
            const geometry = wellknown.parse(text);
            geojson = {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry, properties: {} }]
            };
        } else if (extension === 'zip') {
            if (!window.shp) throw new Error('Biblioteca Shapefile no disponible');
            const arrayBuffer = await file.arrayBuffer();
            const data = await shp(arrayBuffer);
            if (Array.isArray(data)) {
                geojson = {
                    type: 'FeatureCollection',
                    features: data.flatMap((item) => item.features || [])
                };
            } else {
                geojson = data;
            }
        } else {
            throw new Error('Formato no compatible. Usa KML, GeoJSON, GPX, SHP (.zip), WKT (.txt/.wkt) o TopoJSON.');
        }

        const layerName = file.name.replace(/\.[^/.]+$/, '');
        const uniqueName = getUniqueLayerName(layerName);
        const geojsonLayer = L.geoJSON(geojson, {
            style: {
                color: '#5b7f3c',
                weight: 2,
                opacity: 0.85,
                fillOpacity: 0.25
            },
            pointToLayer(feature, latlng) {
                if (feature.geometry && /Point|MultiPoint/i.test(feature.geometry.type)) {
                    return L.circleMarker(latlng, {
                        radius: 6,
                        color: '#5b7f3c',
                        weight: 2,
                        fillColor: '#86a467',
                        fillOpacity: 0.7
                    });
                }
                return L.marker(latlng);
            }
        }).addTo(map);
        overlayLayers[uniqueName] = geojsonLayer;
        activeLayers[uniqueName] = geojsonLayer;
        layerControls.push({
            name: uniqueName,
            type: 'overlay',
            description: 'Capa cargada desde archivo.'
        });
        cacheOriginalStyles(geojsonLayer);
        updateLayerOpacity(uniqueName, getLayerTransparency(uniqueName));
        renderLayerList(layerSearch.value);
        fileInput.value = '';
        baseMapSelector?.classList.remove('open');
        layerList.classList.remove('hidden');
    } catch (error) {
        alert(error.message || 'No se pudo cargar el archivo. Revisa el formato.');
        console.error(error);
    }
}

function getUniqueLayerName(baseName) {
    let name = baseName;
    let counter = 1;
    while (layerControls.some((layer) => layer.name === name)) {
        name = `${baseName} (${counter})`;
        counter += 1;
    }
    return name;
}

function toggleLayerVisibility(layerData) {
    const isActive = Boolean(activeLayers[layerData.name]);
    if (isActive) {
        if (layerData.type === 'overlay') {
            map.removeLayer(activeLayers[layerData.name]);
            delete activeLayers[layerData.name];
        } else if (layerData.type === 'wfs') {
            removeWfsLayer(layerData.name);
        }
    } else {
        if (layerData.type === 'overlay') {
            overlayLayers[layerData.name]?.addTo(map);
            activeLayers[layerData.name] = overlayLayers[layerData.name];
        } else if (layerData.type === 'wfs') {
            addWfsLayer(layerData);
        }
    }
    renderLayerList(layerSearch.value);
}

renderBaseMapOptions();

function createLayerItem(layerData) {
    const layerItem = document.createElement('div');
    layerItem.className = 'layer-item';

    const header = document.createElement('div');
    header.className = 'layer-item-header';

    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'layer-title-wrapper';

    const label = document.createElement('label');
    label.htmlFor = `chk-${layerData.name}`;
    label.className = 'layer-name';
    label.innerText = layerData.name;

    titleWrapper.appendChild(label);

    if (layerData.description) {
        const description = document.createElement('small');
        description.className = 'layer-description';
        description.innerText = layerData.description;
        titleWrapper.appendChild(description);
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `chk-${layerData.name}`;
    checkbox.checked = Boolean(activeLayers[layerData.name]);

    checkbox.addEventListener('change', async (event) => {
        await toggleLayer(layerData, event.target.checked);
    });

    header.appendChild(titleWrapper);
    header.appendChild(checkbox);
    layerItem.appendChild(header);

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'layer-transparency';

    const transparencyLabel = document.createElement('div');
    transparencyLabel.className = 'transparency-label';
    transparencyLabel.innerHTML = `<span>Transparencia</span><strong>${Math.round(getLayerTransparency(layerData.name) * 100)}%</strong>`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = `${Math.round(getLayerTransparency(layerData.name) * 100)}`;
    slider.className = 'transparency-slider';
    slider.addEventListener('input', (event) => {
        const value = Number(event.target.value);
        transparencyLabel.querySelector('strong').textContent = `${value}%`;
        setLayerTransparency(layerData.name, value / 100);
    });

    sliderContainer.appendChild(transparencyLabel);
    sliderContainer.appendChild(slider);
    layerItem.appendChild(sliderContainer);

    if (layerData.legendMap && typeof layerData.legendMap === 'object') {
        const legend = document.createElement('div');
        legend.className = 'layer-legend';
        Object.entries(layerData.legendMap).forEach(([labelText, color]) => {
            if (labelText === 'Sin clasificación') return;
            const item = document.createElement('div');
            item.className = 'legend-item';

            const swatch = document.createElement('span');
            swatch.className = 'legend-swatch';
            swatch.style.backgroundColor = color;

            const text = document.createElement('span');
            text.innerText = labelText;

            item.appendChild(swatch);
            item.appendChild(text);
            legend.appendChild(item);
        });
        layerItem.appendChild(legend);
    }

    return layerItem;
}

function renderLayerList(filterText = '') {
    layerList.innerHTML = '';
    const searchTerm = String(filterText || '').trim().toLowerCase();
    const filteredLayers = layerControls.filter((layerData) => {
        if (!searchTerm) return true;
        const name = layerData.name.toLowerCase();
        const description = String(layerData.description || '').toLowerCase();
        const legendValues = layerData.legendMap ? Object.keys(layerData.legendMap).join(' ').toLowerCase() : '';
        return name.includes(searchTerm) || description.includes(searchTerm) || legendValues.includes(searchTerm);
    });

    if (!filteredLayers.length) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'layer-empty';
        emptyMessage.textContent = 'No se encontraron capas que coincidan.';
        layerList.appendChild(emptyMessage);
        return;
    }

    filteredLayers.forEach((layerData) => {
        layerList.appendChild(createLayerItem(layerData));
    });
}

function toggleOverlayLayer(name, visible) {
    const layer = overlayLayers[name];
    if (!layer) return;

    if (visible) {
        layer.addTo(map);
        activeLayers[name] = layer;
    } else {
        map.removeLayer(layer);
        delete activeLayers[name];
    }
}

async function toggleLayer(layerData, visible) {
    if (layerData.type === 'overlay') {
        toggleOverlayLayer(layerData.name, visible);
        return;
    }

    if (layerData.type === 'wfs') {
        if (visible) {
            await addWfsLayer(layerData);
        } else {
            removeWfsLayer(layerData.name);
        }
    }
}

async function addWfsLayer(layerData) {
    if (activeLayers[layerData.name] || pendingWfsRequests.has(layerData.name)) return;

    const requestToken = Symbol(layerData.name);
    pendingWfsRequests.set(layerData.name, requestToken);

    try {
        const typeNames = await getWfsTypeNames(layerData);
        if (pendingWfsRequests.get(layerData.name) !== requestToken) return;
        if (!typeNames.length) {
            alert('No se encontró ninguna capa WFS en la respuesta de GetCapabilities.');
            return;
        }

        const geojson = await fetchWfsGeoJson(layerData, typeNames[0]);
        if (pendingWfsRequests.get(layerData.name) !== requestToken) return;
        const wfsLayer = L.geoJSON(geojson, {
            pointToLayer(feature, latlng) {
                if (feature.geometry && /Point|MultiPoint/i.test(feature.geometry.type)) {
                    const style = typeof layerData.style === 'function'
                        ? layerData.style(feature)
                        : layerData.style;

                    const markerStyle = Object.assign({
                        radius: 6,
                        color: '#004a87',
                        weight: 2,
                        opacity: 0.9,
                        fillColor: '#004a87',
                        fillOpacity: 0.65
                    }, style || {});

                    return L.circleMarker(latlng, markerStyle);
                }
                return L.marker(latlng);
            },
            style: (feature) => {
                if (typeof layerData.style === 'function') {
                    return layerData.style(feature);
                }
                return layerData.style || {
                    color: '#004a87',
                    weight: 2,
                    opacity: 0.9,
                    fillOpacity: 0.25
                };
            },
            onEachFeature(feature, layer) {
                if (feature.properties) {
                    const hiddenFields = new Set(['layer', 'objeto', 'entidad', 'id', 'color', 'radius', 'userId']);
                    const props = Object.entries(feature.properties)
                        .filter(([key]) => !hiddenFields.has(key))
                        .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                        .join('<br>');
                    if (props) {
                        layer.bindPopup(props);
                    }
                }
            }
        }).addTo(map);

        activeLayers[layerData.name] = wfsLayer;
        cacheOriginalStyles(wfsLayer);
        updateLayerOpacity(layerData.name, getLayerTransparency(layerData.name));
        if (wfsLayer.getBounds && wfsLayer.getBounds().isValid()) {
            map.fitBounds(wfsLayer.getBounds(), { maxZoom: 12 });
        }
    } catch (error) {
        console.error('Error al cargar capa WFS:', error);
        alert('No se pudo cargar la capa WFS. Revisa la consola para más detalles.');
        const checkbox = document.getElementById(`chk-${layerData.name}`);
        if (checkbox) checkbox.checked = false;
    } finally {
        if (pendingWfsRequests.get(layerData.name) === requestToken) {
            pendingWfsRequests.delete(layerData.name);
        }
    }
}

function removeWfsLayer(name) {
    pendingWfsRequests.delete(name);
    if (!activeLayers[name]) return;
    map.removeLayer(activeLayers[name]);
    delete activeLayers[name];
}

function prefetchWfsCapabilities() {
    layerControls
        .filter((layerData) => layerData.type === 'wfs')
        .forEach((layerData) => {
            getWfsTypeNames(layerData).catch(() => {
                // Ignore prefetch failures; the layer can still load later on demand.
            });
        });
}

renderLayerList();
prefetchWfsCapabilities();

