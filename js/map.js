// Inicializa el mapa Leaflet centrado en Santa Cruz y sin controles de zoom nativos
const map = L.map('map', {
    center: [-48.42, -68.63],
    zoom: 6,
    zoomControl: false
});

// Capas base definidas a partir de servicios TMS/WMS y satelital
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

// Capa base inicial que se muestra al cargar el visor
argenmapLayer.addTo(map);
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution('<a href="https://cap.santacruz.gob.ar/" target="_blank" rel="noopener noreferrer">Consejo Agrario Provincial Santa Cruz</a> | <a href="https://cartosantacruz.github.io/Soporte/" target="_blank" rel="noopener noreferrer">Soporte</a>');

// Referencias DOM y estados globales de la interfaz
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const closeSidebar = document.getElementById('close-sidebar');
const layerList = document.getElementById('layer-list');
const layerSearch = document.getElementById('layer-search');
const baseMapBtn = document.getElementById('base-map-btn');
const addLayerBtn = document.getElementById('add-layer-btn');
const addLayerMenu = document.getElementById('add-layer-menu');
const addFileBtn = document.getElementById('add-file-btn');
const showWmsPanelBtn = document.getElementById('show-wms-panel-btn');
const wmsPanel = document.getElementById('wms-panel');
const wmsUrlInput = document.getElementById('wms-url-input');
const loadWmsLayersBtn = document.getElementById('load-wms-layers-btn');
const refreshWmsBtn = document.getElementById('refresh-wms-btn');
const wmsLayerList = document.getElementById('wms-layer-list');
const baseMapSelector = document.getElementById('base-map-selector');
const fileInput = document.getElementById('file-input');
const attributeTableModal = document.getElementById('attribute-table-modal');
const attributeTableTitle = document.getElementById('attribute-table-title');
const attributeTableSummary = document.getElementById('attribute-table-summary');
const attributeTableContainer = document.getElementById('attribute-table-container');
const attributeTableSave = document.getElementById('attribute-table-save');
const attributeTableCancel = document.getElementById('attribute-table-cancel');
const attributeTableClose = document.getElementById('attribute-table-close');
const attributeTableAddField = document.getElementById('attribute-table-add-field');
const attributeTableRename = document.getElementById('attribute-table-rename');
let attributeTableContext = null;
let attributeTableDraft = null;
const activeLayers = {};

if (attributeTableAddField) {
    attributeTableAddField.addEventListener('click', addAttributeField);
}
if (attributeTableRename) {
    attributeTableRename.addEventListener('click', renameAttributeTableNames);
}

function cloneGeoJSONFeatures(features) {
    try {
        return structuredClone(features);
    } catch (error) {
        return JSON.parse(JSON.stringify(features));
    }
}

function getCurrentAttributeTableFeatures() {
    return attributeTableDraft?.displayFeatures || [];
}

function getCurrentAttributeTableOriginalFeatures() {
    return attributeTableDraft?.originalFeatures || [];
}

function resetAttributeTableDraft() {
    attributeTableDraft = null;
}

function renameAttributeTableNames() {
    if (!attributeTableContext) return;

    if (attributeTableContext.type === 'overlay') {
        const layerData = attributeTableContext.layerData;
        const currentName = getLayerDisplayName(layerData);
        const newName = prompt('Nuevo nombre de capa:', currentName);
        if (newName === null || !newName.trim()) return;
        layerData.displayName = newName.trim();
        renderLayerList(layerSearch.value);
        attributeTableTitle.textContent = `Atributos - ${getLayerDisplayName(layerData)}`;
        return;
    }

    if (attributeTableContext.type === 'drawn') {
        const groupData = attributeTableContext.groupData;
        const currentName = getDrawnGroupLabel(groupData);
        const newName = prompt('Nuevo nombre de grupo:', currentName);
        if (newName === null || !newName.trim()) return;
        groupData.displayLabel = newName.trim();
        renderLayerList(layerSearch.value);
        attributeTableTitle.textContent = `Atributos - ${getDrawnGroupLabel(groupData)}`;
    }
}

const pendingWfsRequests = new Map();
const layerTransparency = new Map();
const drawnLayersMap = new Map();
const drawnGroups = {
    Text: { label: 'Textos', description: 'Etiquetas de texto en el mapa.', layers: new Set(), visible: true },
    Point: { label: 'Puntos', description: 'Marcadores y puntos dibujados.', layers: new Set(), visible: true },
    Circle: { label: 'Círculos', description: 'Círculos creados con la herramienta de dibujo.', layers: new Set(), visible: true },
    LineString: { label: 'Líneas', description: 'Líneas y trayectos dibujados.', layers: new Set(), visible: true },
    Rectangle: { label: 'Rectángulos', description: 'Rectángulos/quadrados dibujados con la herramienta de rectángulo.', layers: new Set(), visible: true },
    Polygon: { label: 'Polígonos', description: 'Áreas y polígonos dibujados.', layers: new Set(), visible: true }
};
const drawnGroupOrder = ['Text', 'Point', 'Circle', 'LineString', 'Rectangle', 'Polygon'];
let drawnLayerCounter = 0;

function getUniqueDrawnLayerName(baseName = 'Dibujo') {
    let name = baseName;
    let counter = 1;
    while (layerControls.some((layer) => layer.name === name) || drawnLayersMap.has(name)) {
        name = `${baseName} ${counter}`;
        counter += 1;
    }
    return name;
}

function getDrawnLayerGroupKey(layer) {
    const props = layer?.feature?.properties || {};
    if (props.text) {
        return 'Text';
    }
    if (/circle/i.test(String(props.tipo || ''))) {
        return 'Circle';
    }
    if (/rectangle|square|cuadrado/i.test(String(props.tipo || ''))) {
        return 'Rectangle';
    }
    const geometryType = String(layer?.feature?.geometry?.type || 'Point');
    if (/polygon/i.test(geometryType)) return 'Polygon';
    if (/line/i.test(geometryType)) return 'LineString';
    return 'Point';
}

function registerDrawnLayer(layer) {
    const name = getUniqueDrawnLayerName('Dibujo');
    layer._drawnName = name;
    layer._drawnVisible = true;
    const groupKey = getDrawnLayerGroupKey(layer);
    layer._drawnType = groupKey;
    drawnLayersMap.set(name, layer);
    if (drawnGroups[groupKey]) {
        drawnGroups[groupKey].layers.add(layer);
        if (!drawnGroups[groupKey].visible) {
            layer._drawnVisible = false;
            map.removeLayer(layer);
        }
    }
    layer.on('remove', () => {
        if (drawnLayersMap.has(name)) {
            drawnLayersMap.delete(name);
        }
        if (drawnGroups[groupKey]) {
            drawnGroups[groupKey].layers.delete(layer);
        }
        renderLayerList(layerSearch.value);
    });
    renderLayerList(layerSearch.value);
}

function toggleDrawnGroupVisibility(groupKey, visible) {
    const group = drawnGroups[groupKey];
    if (!group) return;
    group.visible = visible;
    group.layers.forEach((layer) => {
        layer._drawnVisible = visible;
        if (visible) {
            layer.addTo(map);
        } else {
            if (selectedLayer === layer) {
                deselectLayer(layer);
            }
            map.removeLayer(layer);
        }
    });
}

function toggleDrawnLayerVisibility(name, visible) {
    if (drawnGroups[name]) {
        toggleDrawnGroupVisibility(name, visible);
        renderLayerList(layerSearch.value);
        return;
    }
    const layer = drawnLayersMap.get(name);
    if (!layer) return;
    layer._drawnVisible = visible;
    if (visible) {
        layer.addTo(map);
    } else {
        if (selectedLayer === layer) {
            deselectLayer(layer);
        }
        map.removeLayer(layer);
    }
}

const coordPanel = document.getElementById('ign-coordenadas');
const btnToggleUtility = document.getElementById('btn-toggle-utility');
const btnToggleDibujo = document.getElementById('btn-toggle-dibujo');
const utilityPanel = document.getElementById('utility-panel');
const drawingPanel = document.getElementById('drawing-panel');
const btnMedicion = document.getElementById('btn-medicion');
const btnUbicacion = document.getElementById('btn-ubicacion');
const btnMalla = document.getElementById('btn-malla');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnCaptura = document.getElementById('btn-captura');
const btnImprimir = document.getElementById('btn-imprimir');
const btnConsulta = document.getElementById('btn-consulta');
const btnDrawText = document.getElementById('draw-text');
const btnDrawLine = document.getElementById('draw-line');
const btnDrawPolygon = document.getElementById('draw-polygon');
const btnDrawRectangle = document.getElementById('draw-rectangle');
const btnDrawCircle = document.getElementById('draw-circle');
const btnDrawMarker = document.getElementById('draw-marker');
const btnClearAll = document.getElementById('btn-clear-all');
const btnExportar = document.getElementById('btn-exportar');
const btnZoomIn = document.getElementById('zoom-in');
const btnZoomHome = document.getElementById('zoom-home');
const btnZoomOut = document.getElementById('zoom-out');

// Grupo de capas dibujadas manualmente y variables de control de eventos
const drawnLayers = L.featureGroup().addTo(map);
let currentClickListener = null;
let currentDblClickListener = null;
let tempPoints = [];
let tempGuideLayer = null;
let gridLayer = null;
let activeDrawMode = null;
let selectedLayer = null;
let firstRectangleCorner = null;
let circleCenterPoint = null;
let measurementDistance = 0;

// Convierte coordenadas decimales a formato DMS legible
function formatDms(value, isLat) {
    const hemisphere = isLat ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'O' : 'E');
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutesDecimal = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);
    return `${degrees}° ${minutes}' ${seconds}" ${hemisphere}`;
}

function updateCoordinates(latlng) {
    if (!coordPanel || !latlng) return;
    coordPanel.innerHTML = `${formatDms(latlng.lat, true)} , ${formatDms(latlng.lng, false)}`;
}

function detachMapHandlers() {
    if (currentClickListener) {
        map.off('click', currentClickListener);
        currentClickListener = null;
    }
    if (currentDblClickListener) {
        map.off('dblclick', currentDblClickListener);
        currentDblClickListener = null;
    }
}

function clearTemporaryDraw() {
    tempPoints = [];
    firstRectangleCorner = null;
    circleCenterPoint = null;
    measurementDistance = 0;
    if (tempGuideLayer) {
        map.removeLayer(tempGuideLayer);
        tempGuideLayer = null;
    }
}

// Restablece el estado de dibujo/selección al valor por defecto
function resetModes() {
    detachMapHandlers();
    clearTemporaryDraw();
    map.getContainer().style.cursor = '';
    document.querySelectorAll('.draw-sub-btn, .util-sub-btn').forEach((button) => button?.classList?.remove('active'));
    activeDrawMode = null;
    if (map.doubleClickZoom) {
        map.doubleClickZoom.enable();
    }
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Crea un icono HTML para un marcador de texto editable en el mapa
function createTextIcon(text, fontSize = 14, selected = false, scale = 1) {
    const classes = `draw-text-label${selected ? ' selected' : ''}`;
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return L.divIcon({
        html: `
            <div class="draw-text-marker-container${selected ? ' selected' : ''}">
                <div class="${classes}" style="font-size:${fontSize}px; line-height:1.2; display:inline-block; transform:scale(${safeScale}); transform-origin:left center; white-space:nowrap;">${escapeHtml(text)}</div>
                ${selected ? '<div class="draw-text-handle" title="Arrastra para escalar"></div>' : ''}
            </div>
        `,
        className: 'draw-text-marker-icon',
        iconSize: null
    });
}

// Actualiza el icono del texto cuando cambia el contenido, tamaño o escala
function updateTextMarkerIcon(marker) {
    if (!marker || !marker.feature || !marker.feature.properties) return;
    const { text, fontSize, selected, scale } = marker.feature.properties;
    marker.setIcon(createTextIcon(text, fontSize || 14, !!selected, scale || 1));
    setTimeout(() => attachTextHandleEvents(marker), 0);
}

// Añade eventos de arrastre al controlador de escala dentro del texto seleccionado
function attachTextHandleEvents(marker) {
    if (!marker || !marker.feature || !marker.feature.properties) return;
    const icon = marker.getElement ? marker.getElement() : marker._icon;
    if (!icon) return;
    const handle = icon.querySelector('.draw-text-handle');
    if (!handle || handle._resizeAttached) return;

    handle._resizeAttached = true;
    let startX = 0;
    let startScale = marker.feature.properties.scale || 1;

    const onMouseMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const newScale = Math.max(0.5, Math.min(4, startScale + delta / 120));
        marker.feature.properties.scale = newScale;
        updateTextMarkerIcon(marker);
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        event.preventDefault();
        startX = event.clientX;
        startScale = marker.feature.properties.scale || 1;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// Selecciona una capa o marcador dentro del grupo de dibujos para editarla o eliminarla
function selectLayer(layer) {
    if (selectedLayer === layer) return;
    deselectLayer(selectedLayer);
    if (!layer) return;

    selectedLayer = layer;
    if (layer.setStyle && layer.options) {
        layer._originalStyle = layer._originalStyle || {
            color: layer.options.color,
            weight: layer.options.weight,
            fillOpacity: layer.options.fillOpacity,
            dashArray: layer.options.dashArray
        };
        layer.setStyle({ color: '#1aa3ff', weight: (layer.options.weight || 3) + 1, dashArray: '6,4' });
    }
    if (layer instanceof L.Marker && layer.feature?.properties?.text) {
        layer.feature.properties.selected = true;
        updateTextMarkerIcon(layer);
    }
}

function deselectLayer(layer) {
    if (!layer) return;
    if (layer.setStyle && layer._originalStyle) {
        layer.setStyle({
            color: layer._originalStyle.color,
            weight: layer._originalStyle.weight,
            fillOpacity: layer._originalStyle.fillOpacity,
            dashArray: layer._originalStyle.dashArray
        });
    }
    if (layer instanceof L.Marker && layer.feature?.properties?.text) {
        layer.feature.properties.selected = false;
        updateTextMarkerIcon(layer);
    }
    if (selectedLayer === layer) {
        selectedLayer = null;
    }
}

function attachLayerSelection(layer) {
    if (!layer) return;
    layer.on('click', function (e) {
        if (e && e.originalEvent) e.originalEvent.stopPropagation();
        selectLayer(layer);
    });
    if (layer instanceof L.Marker && layer.feature?.properties?.text) {
        layer.on('add', () => attachTextHandleEvents(layer));
        layer.on('dblclick', function (e) {
            if (e && e.originalEvent) e.originalEvent.stopPropagation();
            editTextMarker(layer);
        });
        if (layer.options.draggable) {
            layer.on('dragend', function () {
                const latlng = layer.getLatLng();
                if (layer.feature && layer.feature.geometry) {
                    layer.feature.geometry.coordinates = [latlng.lng, latlng.lat];
                }
            });
        }
    }
}

function addFeatureToDrawnLayer(layer, feature) {
    if (feature) layer.feature = feature;
    drawnLayers.addLayer(layer);
    attachLayerSelection(layer);
    registerDrawnLayer(layer);
}

function createFinalFeature(layer, geometryType, coords, extraProps = {}) {
    const feature = {
        type: 'Feature',
        properties: { tipo: geometryType, ...extraProps },
        geometry: {
            type: geometryType === 'Circle' ? 'Point' : geometryType,
            coordinates: coords
        }
    };
    addFeatureToDrawnLayer(layer, feature);
}

// Abre la edición de texto para un marcador de texto seleccionado
function editTextMarker(marker) {
    if (!marker || !marker.feature || !marker.feature.properties) return;
    const props = marker.feature.properties;
    const newText = prompt('Editar texto:', props.text || 'Texto');
    if (newText !== null) {
        props.text = newText || props.text;
        const sizeInput = prompt('Tamaño de texto en px:', props.fontSize || 14);
        const fontSize = parseInt(sizeInput, 10);
        if (!Number.isNaN(fontSize) && fontSize > 0) {
            props.fontSize = fontSize;
        }
        const scaleInput = prompt('Escala del texto (1 = normal):', props.scale || 1);
        const scaleValue = parseFloat(scaleInput);
        if (!Number.isNaN(scaleValue) && scaleValue > 0) {
            props.scale = scaleValue;
        }
    }
    props.selected = false;
    deselectLayer(marker);
}

// Muestra u oculta el panel de utilidades generales del visor
function toggleUtilityPanel() {
    btnToggleUtility?.classList.toggle('active');
    utilityPanel?.classList.toggle('show');
    if (!utilityPanel?.classList?.contains('show')) {
        resetModes();
    }
}

function toggleDrawingPanel() {
    btnToggleDibujo?.classList.toggle('active');
    drawingPanel?.classList.toggle('show');
    if (!drawingPanel?.classList?.contains('show')) {
        resetModes();
    }
}

// Inicia el modo de medición de distancia en el mapa
function startMeasureMode() {
    resetModes();
    activeDrawMode = 'measure';
    btnMedicion?.classList.add('active');
    map.getContainer().style.cursor = 'help';
    measurementDistance = 0;
    tempPoints = [];

    currentClickListener = function (e) {
        tempPoints.push(e.latlng);
        if (tempPoints.length > 1) {
            measurementDistance += tempPoints[tempPoints.length - 2].distanceTo(e.latlng);
            const popup = L.popup({ closeButton: false, autoClose: true })
                .setLatLng(e.latlng)
                .setContent(`Distancia: ${(measurementDistance / 1000).toFixed(3)} km`)
                .openOn(map);
        }
        if (tempGuideLayer) map.removeLayer(tempGuideLayer);
        tempGuideLayer = L.polyline(tempPoints, { color: '#333', weight: 2, dashArray: '4,4' }).addTo(map);
    };

    currentDblClickListener = function () {
        if (tempPoints.length > 1) {
            const line = L.polyline(tempPoints, { color: '#0056b3', weight: 3 });
            createFinalFeature(line, 'LineString', tempPoints.map((p) => [p.lng, p.lat]));
        }
        resetModes();
    };

    map.on('click', currentClickListener);
    map.on('dblclick', currentDblClickListener);
}

// Inicia el modo de identificación de objetos y sus propiedades
function startIdentifyMode() {
    resetModes();
    activeDrawMode = 'identify';
    btnConsulta?.classList.add('active');
    map.getContainer().style.cursor = 'crosshair';

    currentClickListener = function (e) {
        let info = `<strong>Coordenadas:</strong><br>${formatDms(e.latlng.lat, true)} , ${formatDms(e.latlng.lng, false)}`;
        map.eachLayer((layer) => {
            if (layer.feature && layer.getBounds && layer.getBounds().contains(e.latlng)) {
                const props = layer.feature.properties || {};
                const propsText = Object.entries(props)
                    .map(([key, value]) => `<strong>${key}</strong>: ${value}`)
                    .join('<br>');
                if (propsText) {
                    info += `<br><br><strong>Propiedades:</strong><br>${propsText}`;
                }
            }
        });
        L.popup().setLatLng(e.latlng).setContent(info).openOn(map);
    };

    map.on('click', currentClickListener);
}

// Inicia el modo de dibujo para texto, líneas, polígonos, rectángulos, círculos o puntos
function startDrawMode(mode) {
    resetModes();
    activeDrawMode = mode;
    if (map.doubleClickZoom) {
        map.doubleClickZoom.disable();
    }
    map.getContainer().style.cursor = 'crosshair';
    if (mode === 'text') btnDrawText?.classList.add('active');
    if (mode === 'line') btnDrawLine?.classList.add('active');
    if (mode === 'polygon') btnDrawPolygon?.classList.add('active');
    if (mode === 'rectangle') btnDrawRectangle?.classList.add('active');
    if (mode === 'circle') btnDrawCircle?.classList.add('active');
    if (mode === 'marker') btnDrawMarker?.classList.add('active');

    currentClickListener = function (e) {
        if ((mode === 'line' || mode === 'polygon') && tempPoints.length > 0) {
            const lastPoint = tempPoints[tempPoints.length - 1];
            if (lastPoint && lastPoint.equals(e.latlng)) {
                return;
            }
        }

        if (mode === 'marker') {
            const marker = L.marker(e.latlng).addTo(map);
            createFinalFeature(marker, 'Point', [e.latlng.lng, e.latlng.lat]);
            resetModes();
            return;
        }

        if (mode === 'text') {
            const text = prompt('Texto para agregar en el mapa:', 'Texto');
            if (text) {
                const props = { tipo: 'Point', text, fontSize: 14, scale: 1, selected: false };
                const marker = L.marker(e.latlng, {
                    icon: createTextIcon(text, props.fontSize, false, props.scale),
                    draggable: true
                }).addTo(map);
                const feature = {
                    type: 'Feature',
                    properties: props,
                    geometry: { type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] }
                };
                createFinalFeature(marker, 'Point', feature.geometry.coordinates);
                marker.feature = feature;
                updateTextMarkerIcon(marker);
            }
            resetModes();
            return;
        }

        if (mode === 'line' || mode === 'polygon') {
            tempPoints.push(e.latlng);
            if (tempGuideLayer) map.removeLayer(tempGuideLayer);
            tempGuideLayer = mode === 'line'
                ? L.polyline(tempPoints, { color: '#e44d26', weight: 3 })
                : L.polygon(tempPoints, { color: '#e44d26', weight: 3, fillOpacity: 0.2 });
            tempGuideLayer.addTo(map);

            if (!currentDblClickListener) {
                currentDblClickListener = function () {
                    if (tempPoints.length > 1) {
                        const layer = mode === 'line'
                            ? L.polyline(tempPoints, { color: '#e44d26', weight: 3 })
                            : L.polygon(tempPoints, { color: '#e44d26', weight: 3, fillOpacity: 0.2 });
                        const coords = tempPoints.map((p) => [p.lng, p.lat]);
                        if (mode === 'polygon') coords.push([tempPoints[0].lng, tempPoints[0].lat]);
                        createFinalFeature(layer, mode === 'line' ? 'LineString' : 'Polygon', mode === 'line' ? coords : [coords]);
                    }
                    resetModes();
                };
                map.on('dblclick', currentDblClickListener);
            }
            return;
        }

        if (mode === 'rectangle') {
            if (!firstRectangleCorner) {
                firstRectangleCorner = e.latlng;
                tempGuideLayer = L.rectangle([firstRectangleCorner, e.latlng], { color: '#e44d26', weight: 2, fillOpacity: 0.1 }).addTo(map);
                return;
            }
            const rectangle = L.rectangle([firstRectangleCorner, e.latlng], { color: '#e44d26', weight: 2, fillOpacity: 0.1 });
            createFinalFeature(rectangle, 'Rectangle', [[
                [firstRectangleCorner.lng, firstRectangleCorner.lat],
                [e.latlng.lng, firstRectangleCorner.lat],
                [e.latlng.lng, e.latlng.lat],
                [firstRectangleCorner.lng, e.latlng.lat],
                [firstRectangleCorner.lng, firstRectangleCorner.lat]
            ]], { shape: 'Rectangle' });
            resetModes();
            return;
        }

        if (mode === 'circle') {
            if (!circleCenterPoint) {
                circleCenterPoint = e.latlng;
                tempGuideLayer = L.circle(circleCenterPoint, { radius: 1, color: '#e44d26', weight: 2, fillOpacity: 0.1 }).addTo(map);
                return;
            }
            const radius = circleCenterPoint.distanceTo(e.latlng);
            const circle = L.circle(circleCenterPoint, { radius, color: '#e44d26', weight: 2, fillOpacity: 0.15 });
            createFinalFeature(circle, 'Circle', [circleCenterPoint.lng, circleCenterPoint.lat], { radius });
            resetModes();
            return;
        }
    };

    map.on('click', currentClickListener);
}

// Activa o desactiva la malla de coordenadas en el mapa
function toggleGrid() {
    btnMalla?.classList.toggle('active');
    if (btnMalla?.classList.contains('active')) {
        drawGrid();
        map.on('moveend', drawGrid);
    } else {
        removeGrid();
        map.off('moveend', drawGrid);
    }
}

function drawGrid() {
    if (gridLayer) {
        map.removeLayer(gridLayer);
        gridLayer = null;
    }
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    let interval = 3;
    if (zoom >= 7) interval = 1;
    if (zoom >= 9) interval = 0.5;
    if (zoom <= 5) interval = 5;

    const lines = [];
    const startLat = Math.ceil(bounds.getSouth() / interval) * interval;
    const endLat = bounds.getNorth();
    const startLng = Math.ceil(bounds.getWest() / interval) * interval;
    const endLng = bounds.getEast();

    for (let lat = startLat; lat <= endLat; lat += interval) {
        lines.push(L.polyline([[lat, bounds.getWest()], [lat, bounds.getEast()]], { color: '#000', weight: 0.3, opacity: 0.5 }));
        const label = `${lat}°00'00"`;
        // Etiqueta a la derecha
        lines.push(L.marker([lat, bounds.getEast()], {
            icon: L.divIcon({ html: `<div class="malla-text-halo">${label}</div>`, className: 'malla-label-container', iconAnchor: [60, 7], iconSize: null }),
            interactive: false
        }));
        // Etiqueta a la izquierda
        lines.push(L.marker([lat, bounds.getWest()], {
            icon: L.divIcon({ html: `<div class="malla-text-halo">${label}</div>`, className: 'malla-label-container', iconAnchor: [0, 7], iconSize: null }),
            interactive: false
        }));
    }

    for (let lng = startLng; lng <= endLng; lng += interval) {
        lines.push(L.polyline([[bounds.getSouth(), lng], [bounds.getNorth(), lng]], { color: '#000', weight: 0.3, opacity: 0.5 }));
        const label = `${lng}°00'00"`;
        // Etiqueta arriba
        lines.push(L.marker([bounds.getNorth(), lng], {
            icon: L.divIcon({ html: `<div class="malla-text-halo">${label}</div>`, className: 'malla-label-container', iconAnchor: [24, -2], iconSize: null }),
            interactive: false
        }));
        // Etiqueta abajo (solo si no está muy cerca del borde inferior para no tapar atribución)
        const southLat = bounds.getSouth();
        lines.push(L.marker([southLat + interval * 0.1, lng], {
            icon: L.divIcon({ html: `<div class="malla-text-halo">${label}</div>`, className: 'malla-label-container', iconAnchor: [24, 12], iconSize: null }),
            interactive: false
        }));
    }

    gridLayer = L.layerGroup(lines).addTo(map);
}

function removeGrid() {
    if (gridLayer) {
        map.removeLayer(gridLayer);
        gridLayer = null;
    }
}

// Exporta los dibujos actuales en el mapa a un archivo GeoJSON descargable
function exportDrawnGeoJSON() {
    const features = [];
    drawnLayers.eachLayer((layer) => {
        if (layer.feature) {
            features.push(layer.feature);
        }
    });
    if (!features.length) {
        alert('No hay elementos para exportar.');
        return;
    }
    const data = JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'capas_visor.geojson';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// Centra el mapa en la ubicación geolocalizada del usuario
function centerOnLocation() {
    if (!navigator.geolocation) {
        alert('Geolocalización no disponible en este navegador.');
        return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
        map.setView([position.coords.latitude, position.coords.longitude], 12);
    }, () => {
        alert('No se pudo obtener la ubicación.');
    });
}

map.on('mousemove', function (e) {
    updateCoordinates(e.latlng);
});

map.on('click', function () {
    if (!activeDrawMode && selectedLayer) {
        deselectLayer(selectedLayer);
    }
});

btnToggleUtility?.addEventListener('click', toggleUtilityPanel);
btnToggleDibujo?.addEventListener('click', toggleDrawingPanel);
btnMedicion?.addEventListener('click', startMeasureMode);
btnUbicacion?.addEventListener('click', centerOnLocation);
btnMalla?.addEventListener('click', toggleGrid);
btnFullscreen?.addEventListener('click', function () {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
});
btnCaptura?.addEventListener('click', function () {
    alert('Captura de pantalla no disponible sin biblioteca adicional. Usa Imprimir o añade html2canvas si deseas guardar una imagen.');
});
btnImprimir?.addEventListener('click', function () {
    window.print();
});
btnConsulta?.addEventListener('click', startIdentifyMode);
btnDrawText?.addEventListener('click', function () { startDrawMode('text'); });
btnDrawLine?.addEventListener('click', function () { startDrawMode('line'); });
btnDrawPolygon?.addEventListener('click', function () { startDrawMode('polygon'); });
btnDrawRectangle?.addEventListener('click', function () { startDrawMode('rectangle'); });
btnDrawCircle?.addEventListener('click', function () { startDrawMode('circle'); });
btnDrawMarker?.addEventListener('click', function () { startDrawMode('marker'); });
btnZoomIn?.addEventListener('click', function () { map.zoomIn(); });
btnZoomHome?.addEventListener('click', function () { map.setView([-48.42, -68.63], 6); });
btnZoomOut?.addEventListener('click', function () { map.zoomOut(); });
btnClearAll?.addEventListener('click', function () {
    if (!selectedLayer) {
        alert('Selecciona un dibujo para eliminarlo.');
        return;
    }
    if (confirm('¿Eliminar el dibujo seleccionado?')) {
        drawnLayers.removeLayer(selectedLayer);
        deselectLayer(selectedLayer);
    }
});
btnExportar?.addEventListener('click', exportDrawnGeoJSON);

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
baseMapBtn?.addEventListener('click', () => {
    const open = baseMapSelector?.classList.toggle('open');
    if (baseMapSelector) {
        layerList.classList.toggle('hidden', open);
    }
    if (addLayerMenu) {
        addLayerMenu.classList.remove('open');
        wmsPanel?.classList.remove('visible');
    }
});
addLayerBtn?.addEventListener('click', () => {
    const open = addLayerMenu?.classList.toggle('open');
    if (open && baseMapSelector) {
        baseMapSelector.classList.remove('open');
    }
    if (!open && wmsPanel) {
        wmsPanel.classList.remove('visible');
    }
});
addFileBtn?.addEventListener('click', () => {
    fileInput?.click();
    addLayerMenu?.classList.remove('open');
    if (wmsLayerList) wmsLayerList.innerHTML = '';
});
showWmsPanelBtn?.addEventListener('click', () => {
    const visible = wmsPanel?.classList.toggle('visible');
    if (visible && wmsLayerList) {
        wmsLayerList.innerHTML = '';
    }
});
loadWmsLayersBtn?.addEventListener('click', () => {
    if (wmsLayerList) {
        wmsLayerList.innerHTML = '<div class="wms-layer-item">Cargando capas...</div>';
    }
    loadWmsCapabilities();
});
refreshWmsBtn?.addEventListener('click', () => {
    if (wmsLayerList) wmsLayerList.innerHTML = '';
    if (wmsUrlInput) wmsUrlInput.value = '';
});
fileInput?.addEventListener('change', handleFileInput);

layerSearch?.addEventListener('input', () => {
    renderLayerList(layerSearch.value);
});

// Cambia la capa base visible en el mapa
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

// Maneja la carga de archivos geoespaciales locales y los convierte a GeoJSON
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

async function loadWmsCapabilities() {
    if (!wmsUrlInput) return;
    const urlValue = String(wmsUrlInput.value || '').trim();
    if (!urlValue) {
        alert('Ingresa la URL del servicio WMS.');
        return;
    }

    const baseUrl = normalizeWmsUrl(urlValue);
    const capabilitiesUrl = buildWmsRequestUrl(baseUrl, {
        service: 'WMS',
        request: 'GetCapabilities',
        version: '1.3.0'
    });

    try {
        const response = await fetch(capabilitiesUrl);
        if (!response.ok) throw new Error(`GetCapabilities falló con estado ${response.status}`);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        const layers = parseWmsCapabilities(xml);
        renderWmsLayerList(layers, baseUrl);
    } catch (error) {
        alert('No se pudo cargar el listado de capas WMS. Revisa la URL del servicio.');
        console.error(error);
    }
}

function normalizeWmsUrl(urlString) {
    try {
        const url = new URL(urlString);
        const params = new URLSearchParams(url.search);
        ['service', 'request', 'version', 'layers', 'layers', 'styles'].forEach((key) => params.delete(key));
        return `${url.origin}${url.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    } catch (error) {
        return urlString;
    }
}

function buildWmsRequestUrl(baseUrl, paramsObj) {
    try {
        const url = new URL(baseUrl);
        const params = new URLSearchParams(url.search);
        Object.entries(paramsObj).forEach(([key, value]) => params.set(key, value));
        url.search = params.toString();
        return url.toString();
    } catch (error) {
        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}${new URLSearchParams(paramsObj).toString()}`;
    }
}

function parseWmsCapabilities(xml) {
    const layers = [];
    const rootCapability = Array.from(xml.getElementsByTagName('*')).find((node) => node.localName === 'Capability');
    if (!rootCapability) return layers;
    const rootLayer = Array.from(rootCapability.children).find((child) => child.localName === 'Layer');
    if (!rootLayer) return layers;

    function getChildNodesByName(node, name) {
        return Array.from(node.children).filter((child) => child.localName === name);
    }

    function getFirstChildText(node, name) {
        const child = getChildNodesByName(node, name)[0];
        return child?.textContent?.trim() || '';
    }

    function traverse(layerNode, prefix = '') {
        const name = getFirstChildText(layerNode, 'Name');
        const title = getFirstChildText(layerNode, 'Title') || name || '';
        const label = prefix ? `${prefix} / ${title}` : title;

        if (name) {
            layers.push({ name, title: label });
        }

        getChildNodesByName(layerNode, 'Layer').forEach((child) => traverse(child, label));
    }

    traverse(rootLayer);
    return layers;
}

function renderWmsLayerList(layers, baseUrl) {
    if (!wmsLayerList) return;
    wmsLayerList.innerHTML = '';
    if (!layers.length) {
        wmsLayerList.innerHTML = '<div class="wms-layer-item">No se encontraron capas WMS.</div>';
        return;
    }

    layers.forEach((layer) => {
        const item = document.createElement('div');
        item.className = 'wms-layer-item';

        const title = document.createElement('div');
        title.className = 'wms-layer-item-title';
        title.textContent = `${layer.title} (${layer.name})`;

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'wms-layer-add-btn';
        addBtn.textContent = 'Agregar';
        addBtn.addEventListener('click', () => addWmsLayer(baseUrl, layer.name, layer.title));

        item.appendChild(title);
        item.appendChild(addBtn);
        wmsLayerList.appendChild(item);
    });
}

function addWmsLayer(serviceUrl, layerName, layerTitle) {
    const safeName = layerTitle.replace(/[^a-zA-Z0-9-_ ]/g, '_') || layerName || 'WMS_Capa';
    const uniqueName = getUniqueLayerName(`WMS ${safeName}`);
    const wmsLayer = L.tileLayer.wms(serviceUrl, {
        layers: layerName,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        attribution: ''
    });
    wmsLayer.addTo(map);

    overlayLayers[uniqueName] = wmsLayer;
    activeLayers[uniqueName] = wmsLayer;
    layerControls.push({
        name: uniqueName,
        type: 'overlay',
        description: `Capa WMS cargada: ${layerTitle}`
    });
    renderLayerList(layerSearch.value);
    addLayerMenu?.classList.remove('open');
    wmsPanel?.classList.remove('visible');
    if (wmsLayerList) wmsLayerList.innerHTML = '';
    if (wmsUrlInput) wmsUrlInput.value = '';
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

function getLayerDisplayName(layerData) {
    return layerData.displayName || layerData.name;
}

function getDrawnGroupLabel(groupData) {
    return groupData.displayLabel || groupData.label;
}

function getLayerBounds(layer) {
    if (!layer) return null;
    if (typeof layer.getBounds === 'function') {
        try {
            const bounds = layer.getBounds();
            if (bounds && bounds.isValid && bounds.isValid()) return bounds;
        } catch (ignore) {}
    }
    if (typeof layer.getLatLng === 'function') {
        const latlng = layer.getLatLng();
        return L.latLngBounds(latlng, latlng);
    }
    return null;
}

function getLayerGeoJSON(layer) {
    if (!layer) return null;
    if (typeof layer.toGeoJSON === 'function') {
        try {
            return layer.toGeoJSON();
        } catch (ignore) {}
    }
    return null;
}

function parseAttributeValue(value) {
    const trimmed = String(value).trim();
    if (trimmed === '' || trimmed === null) return '';
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
    if (!Number.isNaN(Number(trimmed)) && trimmed !== '-') return Number(trimmed);
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            return JSON.parse(trimmed);
        } catch (ignore) {}
    }
    return value;
}

function updateGeoJsonPopups(layer) {
    if (!layer || typeof layer.eachLayer !== 'function') return;
    layer.eachLayer((featureLayer) => {
        if (!featureLayer?.feature) return;
        const props = featureLayer.feature.properties || {};
        const hiddenFields = new Set(['radius', 'selected']);
        const content = Object.entries(props)
            .filter(([key]) => !hiddenFields.has(key))
            .map(([key, value]) => `<strong>${key}</strong>: ${value}`)
            .join('<br>');
        if (content) {
            featureLayer.bindPopup(content);
        }
    });
}

function closeAttributeTable() {
    attributeTableModal.classList.remove('show');
    attributeTableContainer.innerHTML = '';
    attributeTableContext = null;
    resetAttributeTableDraft();
}

function getFeatureName(feature) {
    if (!feature?.properties || typeof feature.properties !== 'object') return '';
    return feature.properties.nombre ?? feature.properties.name ?? '';
}

function setFeatureName(feature, value) {
    if (!feature.properties || typeof feature.properties !== 'object') {
        feature.properties = {};
    }
    feature.properties.nombre = value;
    if ('name' in feature.properties && feature.properties.name !== value) {
        delete feature.properties.name;
    }
}

function addAttributeField() {
    if (!attributeTableContext || !attributeTableDraft) return;
    const newField = prompt('Nombre del nuevo campo:', 'nuevo_campo');
    if (!newField) return;
    const field = String(newField).trim();
    if (!field || /[^a-zA-Z0-9_]/.test(field)) {
        alert('El nombre del campo solo puede contener letras, números y guiones bajos.');
        return;
    }
    const reservedNames = new Set(['nombre', 'name', 'tipo']);
    if (reservedNames.has(field.toLowerCase())) {
        alert('Este campo está reservado y no puede usarse aquí.');
        return;
    }

    const features = getCurrentAttributeTableFeatures();
    const existingKeys = new Set();
    features.forEach((feature) => {
        if (feature?.properties && typeof feature.properties === 'object') {
            Object.keys(feature.properties).forEach((key) => existingKeys.add(key.toLowerCase()));
        }
    });
    if (existingKeys.has(field.toLowerCase())) {
        alert('El campo ya existe en esta tabla.');
        return;
    }

    features.forEach((feature) => {
        if (!feature.properties) feature.properties = {};
        feature.properties[field] = '';
    });
    renderAttributeTable(features, attributeTableContext);
}

function getFeaturesFromOverlay(layerData) {
    const layer = overlayLayers[layerData.name] || activeLayers[layerData.name];
    const geojson = getLayerGeoJSON(layer);
    return Array.isArray(geojson?.features) ? geojson.features : [];
}

function openAttributeTableForOverlay(layerData) {
    const originalFeatures = getFeaturesFromOverlay(layerData);
    if (!originalFeatures.length) {
        alert('No hay atributos disponibles para esta capa.');
        return;
    }
    const draftFeatures = cloneGeoJSONFeatures(originalFeatures);
    attributeTableTitle.textContent = `Atributos - ${getLayerDisplayName(layerData)}`;
    attributeTableSummary.textContent = `Elementos: ${originalFeatures.length}`;
    const context = { type: 'overlay', layerData };
    attributeTableContext = context;
    attributeTableDraft = { originalFeatures, displayFeatures: draftFeatures };
    renderAttributeTable(draftFeatures, context);
}

function openAttributeTableForDrawnGroup(groupKey) {
    const groupData = drawnGroups[groupKey];
    if (!groupData) return;
    const originalFeatures = Array.from(groupData.layers)
        .map((layer) => layer.feature)
        .filter(Boolean);
    if (!originalFeatures.length) {
        alert('No hay atributos disponibles para este grupo de dibujos.');
        return;
    }
    const draftFeatures = cloneGeoJSONFeatures(originalFeatures);
    attributeTableTitle.textContent = `Atributos - ${getDrawnGroupLabel(groupData)}`;
    attributeTableSummary.textContent = `Elementos: ${originalFeatures.length}`;
    const contextObj = { type: 'drawn', groupKey, groupData };
    attributeTableContext = contextObj;
    attributeTableDraft = { originalFeatures, displayFeatures: draftFeatures };
    renderAttributeTable(draftFeatures, contextObj);
}

function renderAttributeTable(features, context) {
    const allKeys = new Set();
    features.forEach((feature) => {
        if (feature?.properties && typeof feature.properties === 'object') {
            Object.keys(feature.properties).forEach((key) => {
                const lower = key.toLowerCase();
                if (lower !== 'nombre' && lower !== 'name') {
                    allKeys.add(key);
                }
            });
        }
    });
    const headers = ['#', 'Nombre', ...Array.from(allKeys).sort()];

    const table = document.createElement('table');
    table.className = 'attribute-table-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach((key) => {
        const th = document.createElement('th');
        th.textContent = key;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    features.forEach((feature, index) => {
        const row = document.createElement('tr');
        const indexCell = document.createElement('td');
        indexCell.textContent = `${index + 1}`;
        row.appendChild(indexCell);

        const nameCell = document.createElement('td');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        const nameValue = getFeatureName(feature);
        nameInput.value = nameValue !== undefined && nameValue !== null ? String(nameValue) : '';
        nameInput.dataset.featureIndex = String(index);
        nameInput.dataset.propertyKey = 'nombre';
        nameCell.appendChild(nameInput);
        row.appendChild(nameCell);

        headers.slice(2).forEach((key) => {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            const value = feature.properties?.[key];
            input.value = value !== undefined && value !== null ? String(value) : '';
            input.dataset.featureIndex = String(index);
            input.dataset.propertyKey = key;
            const isTypeField = key.toLowerCase() === 'tipo';
            if (isTypeField) {
                input.disabled = true;
                input.title = 'Campo de geometría no editable';
                input.classList.add('attribute-table-readonly');
            }
            cell.appendChild(input);
            row.appendChild(cell);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    attributeTableContainer.innerHTML = '';
    attributeTableContainer.appendChild(table);

    attributeTableSave.onclick = () => {
        const originalFeatures = getCurrentAttributeTableOriginalFeatures();
        const inputs = attributeTableContainer.querySelectorAll('input[data-feature-index]');
        inputs.forEach((input) => {
            const rowIndex = Number(input.dataset.featureIndex);
            const key = input.dataset.propertyKey;
            if (key && key.toLowerCase() === 'tipo') return;
            const value = parseAttributeValue(input.value);
            const feature = originalFeatures[rowIndex] || features[rowIndex];
            if (!feature) return;
            if (!feature.properties) feature.properties = {};
            if (key === 'nombre') {
                setFeatureName(feature, value);
            } else {
                feature.properties[key] = value;
            }
        });

        if (context.type === 'overlay') {
            const layer = overlayLayers[context.layerData.name] || activeLayers[context.layerData.name];
            updateGeoJsonPopups(layer);
        } else if (context.type === 'drawn') {
            context.groupData.layers.forEach((layer) => {
                if (layer.feature && layer.feature.properties) {
                    if (layer instanceof L.Marker && layer.feature.properties.text) {
                        updateTextMarkerIcon(layer);
                    }
                }
            });
        }
        closeAttributeTable();
    };

    attributeTableCancel.onclick = closeAttributeTable;
    attributeTableClose.onclick = closeAttributeTable;
    attributeTableModal.classList.add('show');
}

function downloadGeoJSON(geojson, filename) {
    if (!geojson || !geojson.type) return;
    const data = JSON.stringify(geojson, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.geojson`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function zoomToLayer(layerData) {
    const layer = overlayLayers[layerData.name] || activeLayers[layerData.name];
    if (!layer) {
        alert('Activa la capa primero para poder hacer zoom.');
        return;
    }
    const bounds = getLayerBounds(layer);
    if (bounds) {
        map.fitBounds(bounds, { maxZoom: 16 });
    } else {
        alert('No se pudo obtener los límites de esta capa.');
    }
}

function downloadLayer(layerData) {
    const layer = overlayLayers[layerData.name] || activeLayers[layerData.name];
    if (!layer) {
        alert('Activa la capa primero para descargarla.');
        return;
    }
    const geojson = getLayerGeoJSON(layer);
    if (!geojson) {
        alert('No se pudo generar GeoJSON para esta capa.');
        return;
    }
    downloadGeoJSON(geojson, getLayerDisplayName(layerData).replace(/[^a-zA-Z0-9-_ ]/g, '_'));
}

function deleteOverlayLayer(layerData) {
    if (!confirm(`¿Eliminar la capa "${getLayerDisplayName(layerData)}"?`)) return;
    if (activeLayers[layerData.name]) {
        map.removeLayer(activeLayers[layerData.name]);
        delete activeLayers[layerData.name];
    }
    if (overlayLayers[layerData.name]) {
        delete overlayLayers[layerData.name];
    }
    if (layerData.type === 'wfs') {
        removeWfsLayer(layerData.name);
    }
    const index = layerControls.findIndex((item) => item.name === layerData.name);
    if (index !== -1) {
        layerControls.splice(index, 1);
    }
    renderLayerList(layerSearch.value);
}

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
    label.innerText = getLayerDisplayName(layerData);

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

    if (layerData.type === 'overlay') {
        const actions = document.createElement('div');
        actions.className = 'layer-actions';

        const zoomButton = document.createElement('button');
        zoomButton.type = 'button';
        zoomButton.className = 'layer-action-btn';
        zoomButton.title = 'Zoom a capa';
        zoomButton.textContent = '🔎';
        zoomButton.addEventListener('click', () => zoomToLayer(layerData));
        actions.appendChild(zoomButton);

        const downloadButton = document.createElement('button');

        downloadButton.type = 'button';
        downloadButton.className = 'layer-action-btn';
        downloadButton.title = 'Descargar GeoJSON';
        downloadButton.textContent = '⬇';
        downloadButton.addEventListener('click', () => downloadLayer(layerData));
        actions.appendChild(downloadButton);

        const attrButton = document.createElement('button');
        attrButton.type = 'button';
        attrButton.className = 'layer-action-btn';
        attrButton.title = 'Tabla de atributos';
        attrButton.textContent = '≡';
        attrButton.addEventListener('click', () => openAttributeTableForOverlay(layerData));
        actions.appendChild(attrButton);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'layer-action-btn';
        deleteButton.title = 'Eliminar capa';
        deleteButton.textContent = '✕';
        deleteButton.addEventListener('click', () => deleteOverlayLayer(layerData));
        actions.appendChild(deleteButton);

        layerItem.appendChild(actions);
    }

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

function zoomToDrawnGroup(groupKey) {
    const groupData = drawnGroups[groupKey];
    if (!groupData || !groupData.layers.size) {
        alert('No hay elementos para hacer zoom en este grupo.');
        return;
    }
    const bounds = L.latLngBounds([]);
    groupData.layers.forEach((layer) => {
        const layerBounds = getLayerBounds(layer);
        if (layerBounds) bounds.extend(layerBounds);
    });
    if (bounds.isValid()) {
        map.fitBounds(bounds, { maxZoom: 16 });
    } else {
        alert('No se pudieron calcular los límites de los dibujos.');
    }
}

function downloadDrawnGroup(groupKey) {
    const groupData = drawnGroups[groupKey];
    if (!groupData || !groupData.layers.size) {
        alert('No hay elementos para descargar en este grupo.');
        return;
    }
    const features = [];
    groupData.layers.forEach((layer) => {
        if (layer.feature) {
            features.push(layer.feature);
        }
    });
    if (!features.length) {
        alert('No hay datos para descargar en este grupo.');
        return;
    }
    downloadGeoJSON({ type: 'FeatureCollection', features }, getDrawnGroupLabel(groupData).replace(/[^a-zA-Z0-9-_ ]/g, '_'));
}

function createDrawnGroupItem(groupKey, groupData) {
    const layerItem = document.createElement('div');
    layerItem.className = 'layer-item';

    const header = document.createElement('div');
    header.className = 'layer-item-header';

    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'layer-title-wrapper';

    const label = document.createElement('div');
    label.className = 'layer-name';
    label.textContent = `${getDrawnGroupLabel(groupData)} (${groupData.layers.size})`;
    label.title = groupData.description;
    titleWrapper.appendChild(label);

    const description = document.createElement('small');
    description.className = 'layer-description';
    description.innerText = groupData.description;
    titleWrapper.appendChild(description);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `chk-${groupKey}`;
    checkbox.checked = Boolean(groupData.visible);
    checkbox.addEventListener('change', (event) => {
        toggleDrawnLayerVisibility(groupKey, event.target.checked);
        renderLayerList(layerSearch.value);
    });

    const actions = document.createElement('div');
    actions.className = 'layer-actions';

    const zoomButton = document.createElement('button');
    zoomButton.type = 'button';
    zoomButton.className = 'layer-action-btn';
    zoomButton.title = 'Zoom a dibujos';
    zoomButton.textContent = '🔎';
    zoomButton.addEventListener('click', () => zoomToDrawnGroup(groupKey));
    actions.appendChild(zoomButton);

    const attrButton = document.createElement('button');

    attrButton.type = 'button';
    attrButton.className = 'layer-action-btn';
    attrButton.title = 'Tabla de atributos';
    attrButton.textContent = '≡';
    attrButton.addEventListener('click', () => openAttributeTableForDrawnGroup(groupKey));
    actions.appendChild(attrButton);

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'layer-action-btn';
    downloadButton.title = 'Descargar grupo';
    downloadButton.textContent = '⬇';
    downloadButton.addEventListener('click', () => downloadDrawnGroup(groupKey));
    actions.appendChild(downloadButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'layer-action-btn';
    deleteButton.title = `Eliminar todos los ${groupData.label.toLowerCase()}`;
    deleteButton.textContent = '✕';
    deleteButton.addEventListener('click', () => {
        if (confirm(`¿Eliminar todos los ${getDrawnGroupLabel(groupData).toLowerCase()}?`)) {
            Array.from(groupData.layers).forEach((layer) => {
                drawnLayers.removeLayer(layer);
                if (selectedLayer === layer) {
                    deselectLayer(layer);
                }
            });
            groupData.layers.clear();
            renderLayerList(layerSearch.value);
        }
    });
    actions.appendChild(deleteButton);

    header.appendChild(titleWrapper);
    header.appendChild(actions);
    layerItem.appendChild(header);

    const checkRow = document.createElement('div');
    checkRow.className = 'layer-item-header';
    checkRow.style.justifyContent = 'flex-start';
    checkRow.appendChild(checkbox);
    layerItem.appendChild(checkRow);

    return layerItem;
}

function createLayerSectionHeader(title) {
    const header = document.createElement('div');
    header.className = 'layer-section-header';
    header.textContent = title;
    return header;
}

// Renderiza la lista de capas en el sidebar filtrando por texto de búsqueda
function renderLayerList(filterText = '') {
    layerList.innerHTML = '';
    const searchTerm = String(filterText || '').trim().toLowerCase();

    const filteredOverlayLayers = layerControls.filter((layerData) => {
        if (layerData.type !== 'overlay') return false;
        if (!searchTerm) return true;
        const name = layerData.name.toLowerCase();
        const description = String(layerData.description || '').toLowerCase();
        const legendValues = layerData.legendMap ? Object.keys(layerData.legendMap).join(' ').toLowerCase() : '';
        return name.includes(searchTerm) || description.includes(searchTerm) || legendValues.includes(searchTerm);
    });

    const filteredWfsLayers = layerControls.filter((layerData) => {
        if (layerData.type !== 'wfs') return false;
        if (!searchTerm) return true;
        const name = layerData.name.toLowerCase();
        const description = String(layerData.description || '').toLowerCase();
        const legendValues = layerData.legendMap ? Object.keys(layerData.legendMap).join(' ').toLowerCase() : '';
        return name.includes(searchTerm) || description.includes(searchTerm) || legendValues.includes(searchTerm);
    });

    const filteredDrawnGroups = drawnGroupOrder
        .map((groupKey) => ({ key: groupKey, data: drawnGroups[groupKey] }))
        .filter(({ data }) => {
            if (!data.layers.size) return false;
            if (!searchTerm) return true;
            const label = data.label.toLowerCase();
            const description = data.description.toLowerCase();
            const groupMatch = label.includes(searchTerm) || description.includes(searchTerm);
            const itemMatch = Array.from(data.layers).some((layer) => {
                const propsText = String(layer.feature?.properties?.text || layer.feature?.properties?.tipo || '').toLowerCase();
                return propsText.includes(searchTerm);
            });
            return groupMatch || itemMatch;
        });

    if (!filteredOverlayLayers.length && !filteredDrawnGroups.length && !filteredWfsLayers.length) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'layer-empty';
        emptyMessage.textContent = 'No se encontraron capas que coincidan.';
        layerList.appendChild(emptyMessage);
        return;
    }

    if (filteredOverlayLayers.length) {
        layerList.appendChild(createLayerSectionHeader('Archivos'));
        filteredOverlayLayers.forEach((layerData) => {
            layerList.appendChild(createLayerItem(layerData));
        });
    }

    if (filteredDrawnGroups.length) {
        layerList.appendChild(createLayerSectionHeader('Dibujos'));
        filteredDrawnGroups.forEach(({ key, data }) => {
            layerList.appendChild(createDrawnGroupItem(key, data));
        });
    }

    if (filteredWfsLayers.length) {
        layerList.appendChild(createLayerSectionHeader('Capas'));
        filteredWfsLayers.forEach((layerData) => {
            layerList.appendChild(createLayerItem(layerData));
        });
    }
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

// Agrega una capa WFS al mapa a partir de su configuración y datos GeoJSON
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

window.ellipsisLayers = (function() {
    return layerControls.reduce((obj, layerData) => {
        obj[layerData.name] = layerData;
        return obj;
    }, {});
})();

const originalToggleLayer = toggleLayer;
window.toggleLayer = async (nameOrLayerData, visible) => {
    const layerData = typeof nameOrLayerData === 'string'
        ? layerControls.find((layer) => layer.name === nameOrLayerData)
        : nameOrLayerData;

    if (!layerData) {
        console.warn('toggleLayer: no se encontró la capa', nameOrLayerData);
        return;
    }

    return originalToggleLayer(layerData, visible);
};

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

