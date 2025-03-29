let itemList, searchInput, loader, toast;

document.addEventListener('DOMContentLoaded', async () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.classList.toggle('dark-theme', savedTheme === 'dark');
  
    itemList = document.getElementById('itemList');
    searchInput = document.getElementById('searchInput');
    loader = document.getElementById('loader');
    toast = document.getElementById('toast');    

    searchInput.addEventListener('input', filterItems);
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    
    try {
        await window.authReady; // Espera a la autenticación
        await loadFromCloud(); // Solo carga los datos, sin descargar
    } catch (error) {
        showToast('❌ Error al cargar datos');
        console.error(error);
    }
});

// ========== FUNCIONES PRINCIPALES ========== //
window.addItem = async function() {
    const input = document.getElementById('itemInput');
    const itemText = input.value.trim();

    if (!itemText) return;

    if (Array.from(itemList.children).some(li => 
        li.querySelector('span').textContent.toLowerCase() === itemText.toLowerCase()
    )) {
        showToast('❌ El ítem ya existe');
        return;
    }

    const li = createListItem(itemText);
    itemList.appendChild(li);
    input.value = '';
    await saveToCloud();
};

window.deleteCompletedItems = async function() {
    const items = document.querySelectorAll('#itemList li');
    items.forEach(item => {
        if (item.querySelector('input').checked) {
            item.remove();
        }
    });
    await saveToCloud();
};

// ========== FUNCIONES FIREBASE ========== //
async function checkAuth() {
    if (!window.firebaseSDK.auth.currentUser) {
        throw new Error("Usuario no autenticado");
    }
}

async function saveToCloud() {
    showLoader();
    try {
        await checkAuth();
        const items = Array.from(itemList.children).map(li => ({
            item: li.querySelector('span').textContent,
            status: li.querySelector('input').checked
        }));
        
        await window.firebaseSDK.set(window.firebaseSDK.ref('stock'), items);
        showToast('✅ Datos guardados');
    } catch (error) {
        showToast('❌ Error al guardar');
        console.error("Error detallado:", error);
    } finally {
        hideLoader();
    }
}

window.loadFromCloud = async function() {
    showLoader();
    try {
        await checkAuth();
        const stockRef = window.firebaseSDK.ref('stock');
        const snapshot = await window.firebaseSDK.get(stockRef);
        
        itemList.innerHTML = "";
        if (snapshot.exists()) {
            const items = snapshot.val();
            items.forEach(item => {
                const li = createListItem(item.item, item.status);
                li.classList.toggle('completed', item.status);
                itemList.appendChild(li);
            });
        }
    } catch (error) {
        showToast('❌ Error al cargar');
        console.error(error);
    } finally {
        hideLoader();
    }
};

// ========== FUNCIONES AUXILIARES ========== //
function filterItems() {
    const term = searchInput.value.trim().toLowerCase();
    const searchWords = term.split(' ').filter(word => word.length > 0);
    
    Array.from(itemList.children).forEach(li => {
        const text = li.querySelector('span').textContent.toLowerCase();
        const match = searchWords.every(word => text.includes(word));
        li.style.display = match ? 'flex' : 'none';
    });
}

function createListItem(text, status = false) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'checkbox-container';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = status;

    checkbox.addEventListener('change', async () => {
        li.classList.toggle('completed', checkbox.checked);
        await saveToCloud();
    });
    
    const customCheckbox = document.createElement('div');
    customCheckbox.className = 'checkbox-custom';
    
    const span = document.createElement('span');
    span.textContent = text;
    span.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    });

    label.append(checkbox, customCheckbox);
    li.append(label, span);
    return li;
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('toast-hidden');
    setTimeout(() => toast.classList.add('toast-hidden'), 3000);
}

function showLoader() {
    loader.classList.remove('loader-hidden');
    loader.classList.add('loader');
}

function hideLoader() {
    loader.classList.add('loader-hidden');
}

window.toggleTheme = function() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', 
        document.body.classList.contains('dark-theme') ? 'dark' : 'light'
    );
};

window.handleKeyPress = function(e) {
    if (e.key === 'Enter') addItem();
};

window.saveFile = function() {
    try {
        const items = Array.from(itemList.children).map(li => ({
            Item: li.querySelector('span').textContent,
            Estado: li.querySelector('input').checked ? "Completado" : "Pendiente"
        }));

        if (items.length === 0) {
            showToast('ℹ️ No hay datos para exportar');
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(items);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");
        XLSX.writeFile(workbook, "stock.xlsx");
        showToast('✅ Archivo guardado');
    } catch (error) {
        showToast('❌ Error al exportar');
        console.error(error);
    }
};

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    readExcelFile(file)
        .then(processExcelData)
        .then(() => showToast('✅ Datos cargados desde Excel'))
        .catch(error => {
            showToast('❌ Error en el archivo');
            console.error(error);
        });
}

async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            resolve(workbook);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function processExcelData(workbook) {
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    if (!jsonData[0]?.Item || !jsonData[0]?.Estado) {
        throw new Error("Formato de archivo inválido");
    }

    itemList.innerHTML = "";
    
    jsonData.forEach(item => {
        const li = createListItem(item.Item);
        li.querySelector('input').checked = item.Estado === "Completado";
        if (item.Estado === "Completado") li.classList.add('completed');
        itemList.appendChild(li);
    });
    
    await saveToCloud();
}

// ========== FUNCIONES AUXILIARES ========== //
function filterItems() {
    const term = searchInput.value.trim().toLowerCase();
    
    // Dividir el término de búsqueda en palabras individuales
    const searchWords = term.split(' ').filter(word => word.length > 0);
    
    Array.from(itemList.children).forEach(li => {
        const text = li.querySelector('span').textContent.toLowerCase();
        
        // Verificar si TODAS las palabras existen en el texto
        const match = searchWords.every(word => text.includes(word));
        
        li.style.display = match ? 'flex' : 'none';
    });
}

function createListItem(text, status = false) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'checkbox-container';
    
   const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = status;

    // Evento para guardar cambios automáticamente
    checkbox.addEventListener('change', async () => {
        li.classList.toggle('completed', checkbox.checked);
        await saveToCloud(); // <-- Guarda el nuevo estado
    });
    
       const customCheckbox = document.createElement('div');
    customCheckbox.className = 'checkbox-custom';
    
    const span = document.createElement('span');
    span.textContent = text;
    span.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change')); // <-- Dispara el evento
    });

    label.append(checkbox, customCheckbox);
    li.append(label, span);
    return li;
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('toast-hidden');
    setTimeout(() => toast.classList.add('toast-hidden'), 3000);
}

function showLoader() {
    loader.classList.remove('loader-hidden');
    loader.classList.add('loader');
}

function hideLoader() {
    loader.classList.add('loader-hidden');
}

function filterItems() {
    const term = searchInput.value.trim().toLowerCase();
    
    // Dividir el término de búsqueda en palabras individuales
    const searchWords = term.split(' ').filter(word => word.length > 0);
    
    Array.from(itemList.children).forEach(li => {
        const text = li.querySelector('span').textContent.toLowerCase();
        
        // Verificar si TODAS las palabras existen en el texto
        const match = searchWords.every(word => text.includes(word));
        
        li.style.display = match ? 'flex' : 'none';
    });
}

function toggleItem(li, checkbox) {
    li.classList.toggle('completed', checkbox.checked);
}

function sortItems() {
    const items = Array.from(itemList.children);
    items.sort((a, b) => 
        a.querySelector('span').textContent.localeCompare(
            b.querySelector('span').textContent
        )
    );
    itemList.append(...items);
}

function isDuplicate(text) {
    return Array.from(itemList.children).some(li => 
        li.querySelector('span').textContent.toLowerCase() === text.toLowerCase()
    );
}

// ========== UTILIDADES ========== //
window.toggleTheme = function() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', 
        document.body.classList.contains('dark-theme') ? 'dark' : 'light'
    );
};

window.handleKeyPress = function(e) {
    if (e.key === 'Enter') addItem();
};

function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('toast-hidden');
    setTimeout(() => toast.classList.add('toast-hidden'), 3000);
}

function showLoader() {
    loader.classList.remove('loader-hidden');
    loader.classList.add('loader');
}

function hideLoader() {
    loader.classList.add('loader-hidden');
}

// Función para guardar en Excel
window.saveFile = function() {
    try {
        const items = Array.from(itemList.children).map(li => ({
            Item: li.querySelector('span').textContent,
            Estado: li.querySelector('input').checked ? "Completado" : "Pendiente"
        }));

        if (items.length === 0) {
            showToast('ℹ️ No hay datos para exportar');
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(items);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");
        XLSX.writeFile(workbook, "stock.xlsx");
        showToast('✅ Archivo guardado');
    } catch (error) {
        showToast('❌ Error al exportar');
        console.error(error);
    }
};

// ========== MANEJO DE ARCHIVOS EXCEL ========== //
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    readExcelFile(file)
        .then(processExcelData)
        .then(() => showToast('✅ Datos cargados desde Excel'))
        .catch(error => {
            showToast('❌ Error en el archivo');
            console.error(error);
        });
}

// Función para cargar desde Excel
document.getElementById('fileInput').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const data = await readExcelFile(file);
        await processExcelData(data);
        showToast('✅ Datos cargados desde Excel');
    } catch (error) {
        showToast('❌ Error en el archivo');
        console.error(error);
    }
});

async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            resolve(workbook);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function processExcelData(workbook) {
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // Validar estructura del archivo
    if (!jsonData[0]?.Item || !jsonData[0]?.Estado) {
        throw new Error("Formato de archivo inválido");
    }

    // Limpiar lista actual
    itemList.innerHTML = "";
    
    // Crear nuevos items
    jsonData.forEach(item => {
        const li = createListItem(item.Item);
        li.querySelector('input').checked = item.Estado === "Completado";
        if (item.Estado === "Completado") li.classList.add('completed');
        itemList.appendChild(li);
    });
    
    // Guardar en Firebase
    await saveToCloud();
}