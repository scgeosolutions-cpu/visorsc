// Contenedor para capas tipo overlay cargadas manualmente o desde archivos locales
const overlayLayers = {};

// Definición de capas disponibles en el visor
// Cada capa puede ser de tipo 'wfs' (servicio WFS) u 'overlay' (GeoJSON local/cargado)
const layerControls = [
    {
        name: 'Delegaciones CAP',
        type: 'wfs',
        description: 'Consume GetCapabilities y carga la primera capa WFS disponible como GeoJSON.',
        serviceUrl: 'https://api.ellipsis-drive.com/v3/ogc/wfs/e83a620a-8494-4fc0-8a07-f3616230aa19',
        token: 'epat_sQ496mPZpMuWEC3MAat8to13yxOXZ0vxUWI2qKbucGUusvzp6t2IjhUBYezuilHW',
        style: function(feature) {
            return {
                color: '#5a8f38',
                weight: 2,
                opacity: 0.9,
                fillOpacity: 0.25
            };
        }
    },
    {
        name: 'Bosques Nativos',
        type: 'wfs',
        description: 'Capa WFS de Bosques Nativos.',
        serviceUrl: 'https://api.ellipsis-drive.com/v3/ogc/wfs/d68a159e-96c5-465e-9c97-f15156f578fe',
        token: 'epat_PxesPBesBU0MklNoHPTpJ03zW1VCruSEISPtUMjjRRZq62ARpmQ0TMlHNY7ej7p7',
        // Mapa de leyenda para asignar colores a las categorías de Bosques Nativos
        legendMap: {
            'Lenga': '#d12a2a',
            'Guindo': '#4f5ee1',
            'Nire': '#3aa14a',
            'Matorral Mixto': '#f18f2d',
            'Mixto': '#34b3cb',
            'ñire': '#8c3aba',
            'Sin clasificación': '#8a8a8a'
        },
        // Estilo dinámico que clasifica el bosque según la propiedad tipo_bn
        style(feature) {
            const props = feature?.properties || {};
            const key = Object.keys(props).find((k) => /tipo.*bn/i.test(k));
            const raw = key ? String(props[key] || '').trim() : '';
            const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            let label = 'Sin clasificación';

            if (/^lenga$/i.test(normalized)) {
                label = 'Lenga';
            } else if (/^guindo$/i.test(normalized)) {
                label = 'Guindo';
            } else if (/^matorral mixto$/i.test(normalized)) {
                label = 'Matorral Mixto';
            } else if (/^mixto$/i.test(normalized)) {
                label = 'Mixto';
            } else if (/^nire$/i.test(normalized) || /^ñire$/i.test(raw)) {
                label = 'Nire';
            }

            const color = this.legendMap[label] || '#8a8a8a';
            return {
                color: color,
                weight: 2,
                opacity: 1,
                fillColor: color,
                fillOpacity: 0.65
            };
        }
    },
    {
        name: 'Áreas Protegidas',
        type: 'wfs',
        description: 'Capa WFS de Áreas Protegidas.',
        serviceUrl: 'https://api.ellipsis-drive.com/v3/ogc/wfs/1c15101e-f494-422d-b122-bb87f6a094fe',
        token: 'epat_VkMzbwcAUD66WkTuDjqBP5NQNm1hcBVLToToZUkjI960MMeyKqwJFygxqO0CpCFX',
        style: {
            color: '#0b6b3f',
            weight: 2,
            opacity: 0.9,
            fillColor: '#4ca86a',
            fillOpacity: 0.35
        }
    }
];

// Cache de las respuestas GetCapabilities para evitar múltiples solicitudes al mismo servicio WFS
const wfsCapabilitiesCache = new Map();

// Obtiene los nombres de FeatureType disponibles a partir del GetCapabilities del WFS
async function getWfsTypeNames(layerData) {
    const cacheKey = layerData.serviceUrl;
    if (wfsCapabilitiesCache.has(cacheKey)) {
        return await wfsCapabilitiesCache.get(cacheKey);
    }

    const fetchPromise = (async () => {
        // Construye la URL del GetCapabilities con token y obtiene el XML del servicio
        const capabilitiesUrl = `${layerData.serviceUrl}?request=getCapabilities&token=${encodeURIComponent(layerData.token)}`;
        const response = await fetch(capabilitiesUrl);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        const typeNames = Array.from(xml.querySelectorAll('FeatureType Name'))
            .map((node) => node.textContent.trim())
            .filter(Boolean);
        return typeNames;
    })();

    wfsCapabilitiesCache.set(cacheKey, fetchPromise);
    try {
        return await fetchPromise;
    } catch (error) {
        wfsCapabilitiesCache.delete(cacheKey);
        throw error;
    }
}

// Solicita los features WFS en formato GeoJSON usando el tipo de capa seleccionado
async function fetchWfsGeoJson(layerData, typeName) {
    const url = new URL(layerData.serviceUrl);
    url.search = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        outputFormat: 'application/json',
        count: '1000000',
        token: layerData.token
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`WFS GetFeature falló con estado ${response.status}`);
    }

    return await response.json();
}
