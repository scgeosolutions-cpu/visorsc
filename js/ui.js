document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menu-toggle');
    const closeSidebar = document.getElementById('close-sidebar');
    const layerList = document.getElementById('layer-list');

    // Control del Panel Lateral (Abrir/Cerrar)
    menuToggle.addEventListener('click', () => sidebar.classList.add('active'));
    closeSidebar.addEventListener('click', () => sidebar.classList.remove('active'));

    // Crear dinámicamente la lista de capas desde layers.js
    Object.keys(ellipsisLayers).forEach(name => {
        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'chk-' + name;

        const label = document.createElement('label');
        label.htmlFor = 'chk-' + name;
        label.innerText = name;

        // Al cambiar el checkbox, llamamos a toggleLayer de map.js
        checkbox.addEventListener('change', (e) => {
            toggleLayer(name, e.target.checked);
        });

        layerItem.appendChild(checkbox);
        layerItem.appendChild(label);
        layerList.appendChild(layerItem);
    });
});