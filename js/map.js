const map = L.map('map', {
    center: [-48.42, -68.63],
    zoom: 6,
    zoomControl: false
});

L.control.zoom({ position: 'topright' }).addTo(map);

const argenmapLayer = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
    attribution: '© IGN Argentina',
    minZoom: 2,
    maxZoom: 19
});

const argenmapGrisLayer = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/mapabase_gris@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
    attribution: '© IGN Argentina',
    minZoom: 2,
    maxZoom: 19
});

const argenmapTopoLayer = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/mapabase_topo@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
    attribution: '© IGN Argentina',
    minZoom: 2,
    maxZoom: 19
});

const argenmapOscuroLayer = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/argenmap_oscuro@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
    attribution: '© IGN Argentina',
    minZoom: 2,
    maxZoom: 19
});

const satelitalLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
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

L.control.layers(baseLayers, overlayLayers, { position: 'topright', collapsed: false }).addTo(map);

const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const closeSidebar = document.getElementById('close-sidebar');
const layerList = document.getElementById('layer-list');
const activeLayers = {};

menuToggle.addEventListener('click', () => sidebar.classList.add('active'));
closeSidebar.addEventListener('click', () => sidebar.classList.remove('active'));

function createLayerItem(layerData) {
    const layerItem = document.createElement('div');
    layerItem.className = 'layer-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `chk-${layerData.name}`;

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.innerText = layerData.name;

    layerItem.appendChild(checkbox);
    layerItem.appendChild(label);

    if (layerData.description) {
        const description = document.createElement('small');
        description.innerText = layerData.description;
        layerItem.appendChild(description);
    }

    if (layerData.legendMap && typeof layerData.legendMap === 'object') {
        const legend = document.createElement('div');
        legend.className = 'layer-legend';
        Object.entries(layerData.legendMap).forEach(([label, color]) => {
            if (label === 'Sin clasificación') return;
            const item = document.createElement('div');
            item.className = 'legend-item';

            const swatch = document.createElement('span');
            swatch.className = 'legend-swatch';
            swatch.style.backgroundColor = color;

            const text = document.createElement('span');
            text.innerText = label;

            item.appendChild(swatch);
            item.appendChild(text);
            legend.appendChild(item);
        });
        layerItem.appendChild(legend);
    }

    checkbox.addEventListener('change', async (event) => {
        await toggleLayer(layerData, event.target.checked);
    });

    return layerItem;
}

function renderLayerList() {
    layerList.innerHTML = '';
    layerControls.forEach((layerData) => {
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
    if (activeLayers[layerData.name]) return;

    try {
        const typeNames = await getWfsTypeNames(layerData);
        if (!typeNames.length) {
            alert('No se encontró ninguna capa WFS en la respuesta de GetCapabilities.');
            return;
        }

        const geojson = await fetchWfsGeoJson(layerData, typeNames[0]);
        const wfsLayer = L.geoJSON(geojson, {
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
                    const props = Object.entries(feature.properties)
                        .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                        .join('<br>');
                    layer.bindPopup(props);
                }
            }
        }).addTo(map);

        activeLayers[layerData.name] = wfsLayer;
        if (wfsLayer.getBounds && wfsLayer.getBounds().isValid()) {
            map.fitBounds(wfsLayer.getBounds(), { maxZoom: 12 });
        }
    } catch (error) {
        console.error('Error al cargar capa WFS:', error);
        alert('No se pudo cargar la capa WFS. Revisa la consola para más detalles.');
        const checkbox = document.getElementById(`chk-${layerData.name}`);
        if (checkbox) checkbox.checked = false;
    }
}

function removeWfsLayer(name) {
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

