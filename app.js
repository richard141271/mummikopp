// Firebase Configuration
const firebaseConfig = { 
  apiKey: "AIzaSyClX0a3UyVrGTmmFHT5opE8rxIQTZQaSAw", 
  authDomain: "mummikopp-94e30.firebaseapp.com", 
  projectId: "mummikopp-94e30", 
  storageBucket: "mummikopp-94e30.firebasestorage.app", 
  messagingSenderId: "319234388892", 
  appId: "1:319234388892:web:09c141b3518d3cb6e18e59", 
  measurementId: "G-3YJ92N4MSJ" 
};

// Check for missing config
if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    alert('VIKTIG: Du må sette inn din egen Firebase-konfigurasjon i app.js!');
    console.error('Mangler Firebase konfigurasjon. Se app.js linje 3-10.');
}

// Initialize Firebase (waiting for modules to be loaded from index.html)
let auth, db, storage;
let firebase;

function initFirebase() {
    if (!window.firebaseModules) {
        setTimeout(initFirebase, 100);
        return;
    }
    
    firebase = window.firebaseModules;
    const app = firebase.initializeApp(firebaseConfig);
    auth = firebase.getAuth(app);
    db = firebase.getFirestore(app);
    storage = firebase.getStorage(app);
    
    // Listen for auth state changes
    firebase.onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            handleAuthSuccess();
        } else {
            currentUser = null;
            nav.classList.add('hidden');
            if (!isSharedView) showSection('view-auth');
        }
    });
}

// State
let currentUser = null;
let cups = [];
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || [];
let isSharedView = false;

// DOM Elements
const views = {
    auth: document.getElementById('view-auth'),
    collection: document.getElementById('view-collection'),
    add: document.getElementById('view-add'),
    summary: document.getElementById('view-summary')
};
const nav = document.getElementById('main-nav');
const cupContainer = document.getElementById('collection-container');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    initFirebase();

    // Check for shared view
    const urlParams = new URLSearchParams(window.location.search);
    const sharedUserId = urlParams.get('user_id');

    if (sharedUserId) {
        isSharedView = true;
        handleSharedView(sharedUserId);
    }
    
    // Offline/Online listeners
    window.addEventListener('online', syncOfflineData);
    window.addEventListener('offline', () => alert('Du er nå offline. Endringer lagres lokalt.'));

    // Form Listener
    document.getElementById('auth-form').addEventListener('submit', handleLogin);
    document.getElementById('cup-form').addEventListener('submit', handleSaveCup);
    document.getElementById('image').addEventListener('change', handleImagePreview);
    
    populateYearDropdown();
});

function populateYearDropdown() {
    const yearSelect = document.getElementById('year');
    const currentYear = new Date().getFullYear();
    const startYear = 1990;
    
    // Clear existing (except first placeholder)
    while (yearSelect.options.length > 1) {
        yearSelect.remove(1);
    }

    for (let y = currentYear + 1; y >= startYear; y--) {
        const option = document.createElement('option');
        option.value = y;
        option.text = y;
        yearSelect.appendChild(option);
    }
}

// Navigation
function showSection(sectionId) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    
    if (sectionId === 'view-collection') loadCups();
    if (sectionId === 'view-summary') updateSummary();
}

function handleAuthSuccess() {
    views.auth.classList.add('hidden');
    nav.classList.remove('hidden');
    
    // Add Share Button if not exists
    if (!document.getElementById('share-btn')) {
        const shareBtn = document.createElement('button');
        shareBtn.id = 'share-btn';
        shareBtn.innerText = 'Del samling';
        shareBtn.onclick = shareCollection;
        nav.appendChild(shareBtn);
    }
    
    // Add Force Update Button (for troubleshooting)
    if (!document.getElementById('update-btn')) {
        const updateBtn = document.createElement('button');
        updateBtn.id = 'update-btn';
        updateBtn.innerText = 'Oppdater App';
        updateBtn.style.backgroundColor = '#e74c3c'; // Red to stand out
        updateBtn.onclick = forceUpdateApp;
        nav.appendChild(updateBtn);
    }

    // Check for pending import
    const importSource = sessionStorage.getItem('import_source_id');
    if (importSource) {
        showImportView(importSource);
    } else {
        showSection('view-collection');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const pin = document.getElementById('password').value;
    const password = pin + '00'; // Append 00 to make it 6 chars
    
    try {
        await firebase.signInWithEmailAndPassword(auth, email, password);
        // Auth state listener will handle UI update
    } catch (error) {
        console.error('Login error:', error);
        alert('Innlogging feilet: ' + error.message);
    }
}

async function handleRegister() {
    const email = document.getElementById('email').value;
    const pin = document.getElementById('password').value;

    if (!email || !pin || pin.length !== 4) {
        alert('Fyll inn e-post og en 4-sifret PIN.');
        return;
    }

    const password = pin + '00'; // Append 00 to make it 6 chars

    try {
        await firebase.createUserWithEmailAndPassword(auth, email, password);
        alert('Bruker opprettet! Du er nå logget inn.');
        // Auth state listener will handle UI update
    } catch (error) {
        console.error('Registration error:', error);
        alert('Registrering feilet: ' + error.message);
    }
}

async function logout() {
    await firebase.signOut(auth);
    window.location.href = window.location.pathname; // Reload to clear state
}

// Shared View Logic
async function handleSharedView(userId) {
    views.auth.classList.add('hidden');
    nav.classList.add('hidden');
    
    const header = document.querySelector('header');
    if (!document.getElementById('home-btn')) {
        const homeBtn = document.createElement('button');
        homeBtn.id = 'home-btn';
        homeBtn.innerText = 'Kopier til min samling';
        homeBtn.onclick = () => {
            // Save intention to import from this user
            sessionStorage.setItem('import_source_id', userId);
            window.location.href = window.location.pathname;
        };
        homeBtn.style.cssText = "margin-top: 10px; padding: 5px 10px; cursor: pointer; background-color: #27ae60; color: white; border: none; border-radius: 5px;";
        header.appendChild(homeBtn);
    }

    document.querySelector('.controls button[onclick="showSection(\'view-add\')"]')?.remove();
    
    loadCups(userId);
    showSection('view-collection');
}

function shareCollection() {
    if (!currentUser) return;
    const url = `${window.location.origin}${window.location.pathname}?user_id=${currentUser.uid}`;
    navigator.clipboard.writeText(url).then(() => {
        alert('Lenke til din samling er kopiert til utklippstavlen!');
    });
}

// Data Operations
async function loadCups(userId = null) {
    cupContainer.innerHTML = '<p>Laster...</p>';
    
    const targetUserId = userId || (currentUser ? currentUser.uid : null);
    if (!targetUserId) return;

    if (!navigator.onLine && !isSharedView) {
        const cached = localStorage.getItem('cups_cache');
        if (cached) {
            cups = JSON.parse(cached);
            renderCups();
            return;
        }
    }

    try {
        // Hent alle kopper og filtrer lokalt for å unngå indeks-problemer
        const q = firebase.query(firebase.collection(db, "cups"));
        
        const querySnapshot = await firebase.getDocs(q);
        cups = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Manuell filtrering på user_id
            if (data.user_id === targetUserId) {
                cups.push({ id: doc.id, ...data });
            }
        });

        // Sort client-side to avoid Firestore Index requirement
        cups.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
            const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
            return dateB - dateA; // Descending
        });

        if (!isSharedView) {
            localStorage.setItem('cups_cache', JSON.stringify(cups));
        }
        filterCups(); // This calls renderCups
    } catch (error) {
        console.error('Error loading cups:', error);
        
        // Fallback for indexing error or permission error
        if (error.message.includes('requires an index')) {
             alert('Firestore trenger en indeks. Sjekk konsollen for lenke til å opprette den.');
        }
        
        cupContainer.innerHTML = '<p>Kunne ikke laste samling. (Sjekk konsoll)</p>';
    }
}

let filteredCups = [];

function filterCups() {
    const query = document.getElementById('search-input')?.value.toLowerCase() || '';
    
    if (!query) {
        filteredCups = cups;
    } else {
        filteredCups = cups.filter(cup => 
            cup.name.toLowerCase().includes(query) ||
            (cup.series && cup.series.toLowerCase().includes(query)) ||
            (cup.year && String(cup.year).includes(query)) ||
            (cup.rarity && cup.rarity.toLowerCase().includes(query))
        );
    }
    
    renderCups();
}

function renderCups() {
    cupContainer.innerHTML = '';
    
    // Ensure we are rendering the filtered list, but if filteredCups is empty initially, set it
    if (filteredCups.length === 0 && (!document.getElementById('search-input')?.value) && cups.length > 0) {
        filteredCups = cups;
    }

    if (filteredCups.length === 0) {
        if (cups.length === 0) {
             cupContainer.innerHTML = '<p>Ingen kopper registrert enda.</p>';
        } else {
             cupContainer.innerHTML = '<p>Ingen treff på søk.</p>';
        }
        return;
    }

    filteredCups.forEach(cup => {
        const card = document.createElement('div');
        card.className = 'cup-card';
        if (!isSharedView) {
            card.onclick = (e) => {
                if (!e.target.closest('.action-btn')) editCup(cup);
            };
        }
        
        const imgUrl = cup.image_url || 'https://via.placeholder.com/150?text=Ingen+bilde';
        
        const statusMap = {
            'for_sale': 'Til salgs',
            'sold': 'Solgt',
            'wishlist': 'Ønskeliste'
        };
        const statusLabel = statusMap[cup.status] ? `<span class="status-badge status-${cup.status}">${statusMap[cup.status]}</span>` : '';

        card.innerHTML = `
            <div class="card-header">
                ${statusLabel}
                ${!isSharedView ? `<button class="delete-icon action-btn" onclick="prepareDelete('${cup.id}', event)">🗑️</button>` : ''}
            </div>
            <img src="${imgUrl}" class="cup-img" alt="${cup.name}" loading="lazy">
            <div class="cup-info">
                <h3 class="cup-name">${cup.name}</h3>
                <div class="cup-meta">
                    ${cup.series ? `<span>${cup.series}</span><br>` : ''}
                    <span>${cup.year || '?'}</span> • <span>${cup.rarity || 'Standard'}</span>
                </div>
                <div style="margin-top: 10px; display: flex; gap: 5px; flex-wrap: wrap;">
                    <button class="secondary-btn action-btn" style="padding: 5px; font-size: 0.8rem;" onclick="generateCertificate('${cup.id}')">Sertifikat</button>
                    <button class="secondary-btn action-btn" style="padding: 5px; font-size: 0.8rem;" onclick="generateSinglePDF('${cup.id}')">PDF</button>
                </div>
            </div>
        `;
        cupContainer.appendChild(card);
    });
    
    updateSummaryUI();
}

function setCollectionView(type) {
    cupContainer.className = type === 'list' ? 'list-view' : 'grid-view';
}

// Add/Edit
let editingId = null;

function editCup(cup) {
    editingId = cup.id;
    document.getElementById('form-title').innerText = 'Rediger kopp';
    document.getElementById('cup-id').value = cup.id;
    document.getElementById('name').value = cup.name;
    document.getElementById('series').value = cup.series || '';
    document.getElementById('year').value = cup.year || '';
    document.getElementById('count').value = cup.count || 1;
    document.getElementById('price').value = cup.price_paid || '';
    document.getElementById('value').value = cup.current_value || '';
    document.getElementById('purchase_date').value = cup.purchase_date || '';
    document.getElementById('rarity').value = cup.rarity || 'Standard';
    document.getElementById('status').value = cup.status || 'collection';
    document.getElementById('condition').value = cup.condition || 'Ny';
    document.getElementById('box').checked = cup.box;
    document.getElementById('notes').value = cup.notes || '';
    document.getElementById('image-preview').innerHTML = cup.image_url ? `<img src="${cup.image_url}" width="100">` : '';
    
    document.getElementById('delete-btn').classList.remove('hidden');
    showSection('view-add');
}

function resetForm() {
    editingId = null;
    document.getElementById('form-title').innerText = 'Registrer ny kopp';
    document.getElementById('cup-form').reset();
    document.getElementById('image-preview').innerHTML = '';
    document.getElementById('delete-btn').classList.add('hidden');
}

const originalShowSection = showSection;
showSection = function(id) {
    if (id === 'view-add' && !editingId) {
        resetForm();
    }
    if (id !== 'view-add') {
        editingId = null;
    }
    originalShowSection(id);
}

async function handleSaveCup(e) {
    e.preventDefault();
    console.log("Starting save cup process...");
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Lagrer...';

    if (isSharedView) {
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
        return;
    }
    
    if (!currentUser) {
        alert('Du må være logget inn for å lagre.');
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
        return;
    }

    const formData = {
        user_id: currentUser.uid,
        name: document.getElementById('name').value,
        series: document.getElementById('series').value,
        year: parseInt(document.getElementById('year').value) || null,
        count: parseInt(document.getElementById('count').value) || 1,
        price_paid: parseFloat(document.getElementById('price').value) || 0,
        current_value: parseFloat(document.getElementById('value').value) || 0,
        purchase_date: document.getElementById('purchase_date').value || null,
        rarity: document.getElementById('rarity').value,
        status: document.getElementById('status').value,
        condition: document.getElementById('condition').value,
        box: document.getElementById('box').checked,
        notes: document.getElementById('notes').value,
        updated_at: new Date().toISOString()
    };

    if (!editingId) {
        formData.created_at = new Date().toISOString();
    }

    const imageFile = document.getElementById('image').files[0];
    let imageUrl = null;

    if (imageFile) {
        submitBtn.innerText = 'Komprimerer bilde...';
        
        try {
            // New strategy: Compress to Base64 and store directly in Firestore
            imageUrl = await compressImage(imageFile);
            
            if (!imageUrl) {
                throw new Error("Komprimering ga tomt resultat");
            }
            console.log("Image compressed successfully, size:", imageUrl.length);
            
            if (imageUrl.length > 1000000) {
                 alert("Advarsel: Bildet er fortsatt veldig stort (" + Math.round(imageUrl.length/1024) + "kB). Det kan hende lagring feiler.");
            }
            
        } catch (err) {
            console.error('Image processing error:', err);
            if (!confirm(`Kunne ikke behandle bildet (det kan være formatet ikke støttes, f.eks. HEIC). \nFeilmelding: ${err.message}\n\nVil du lagre uten bilde?`)) {
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
                return;
            }
        }
    }

    if (imageUrl) {
        formData.image_url = imageUrl;
    } else if (!editingId && imageFile) {
        // If we had a file but no URL (and user said OK to save without), ensure we don't save broken link
        // formData.image_url is undefined, which is correct.
    }

    if (navigator.onLine) {
        try {
            // Check total size
            const payloadSize = JSON.stringify(formData).length;
            if (payloadSize > 900000) { // 900KB safety margin for Firestore 1MB limit
                 if (!confirm(`ADVARSEL: Dataene (inkludert bildet) er veldig store (${Math.round(payloadSize/1024)}KB). Dette kan feile. Vil du prøve likevel?`)) {
                     submitBtn.disabled = false;
                     submitBtn.innerText = originalBtnText;
                     return;
                 }
            }

            submitBtn.innerText = 'Lagrer data...';
            console.log("Saving to Firestore...", formData);
            
            if (editingId) {
                const cupRef = firebase.doc(db, "cups", editingId);
                await firebase.updateDoc(cupRef, formData);
                console.log("Update success");
            } else {
                const docRef = await firebase.addDoc(firebase.collection(db, "cups"), formData);
                console.log("Add success, ID:", docRef.id);
            }
            alert('Kopp lagret med suksess!');
            resetForm();
            
            // Wait a bit to ensure propagation or just clear cache
            setTimeout(() => {
                showSection('view-collection');
            }, 500);
            
        } catch (error) {
            console.error('Save error:', error);
            if (error.code === 'permission-denied') {
                alert('Du mangler skrivetilgang til databasen. Gå til Firebase Console -> Firestore Database -> Rules og endre "allow write: if false;" til "allow write: if request.auth != null;"');
            } else {
                alert('Feil ved lagring: ' + error.message);
            }
        }
    } else {
        formData.id = editingId || 'temp_' + Date.now();
        formData.action = editingId ? 'update' : 'insert';
        if (imageUrl) formData.image_url = imageUrl; 
        
        offlineQueue.push(formData);
        localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
        alert('Lagret lokalt (offline). Synkroniseres når du er på nett.');
        resetForm();
        showSection('view-collection');
    }
    
    submitBtn.disabled = false;
    submitBtn.innerText = originalBtnText;
}

async function handleDeleteCup() {
    if (!editingId) return;
    
    if (!confirm('Er du sikker på at du vil slette denne koppen? Dette kan ikke angres.')) {
        return;
    }

    if (navigator.onLine) {
        if (!firebase.deleteDoc) {
             alert("Nettleseren din bruker en gammel versjon av koden. Vennligst last siden på nytt (Hard Refresh: Cmd+Shift+R på Mac, Ctrl+F5 på PC) for å aktivere sletting.");
             return;
        }

        try {
            const cupRef = firebase.doc(db, "cups", editingId);
            await firebase.deleteDoc(cupRef);
            
            alert('Kopp slettet.');
            resetForm();
            showSection('view-collection');
        } catch (error) {
            console.error('Delete error:', error);
            alert('Feil ved sletting: ' + error.message);
        }
    } else {
        // Offline delete
        offlineQueue.push({
            action: 'delete',
            id: editingId
        });
        localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
        
        // Remove from local cache immediately so it disappears from UI
        if (localStorage.getItem('cups_cache')) {
            let cachedCups = JSON.parse(localStorage.getItem('cups_cache'));
            cachedCups = cachedCups.filter(c => c.id !== editingId);
            localStorage.setItem('cups_cache', JSON.stringify(cachedCups));
            cups = cachedCups; // Update memory
        }

        alert('Slettet lokalt (offline). Synkroniseres når du er på nett.');
        resetForm();
        showSection('view-collection');
    }
}

function handleImagePreview(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('image-preview').innerHTML = `<img src="${e.target.result}" width="100">`;
        }
        reader.readAsDataURL(file);
    }
}

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                // Max dimensions
                const MAX_WIDTH = 600;
                const MAX_HEIGHT = 600;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress to JPEG 0.5 quality
                // This typically yields 30-80KB images, well within Firestore 1MB limit
                const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(new Error("Kunne ikke laste bilde for komprimering"));
        };
        reader.onerror = (err) => reject(new Error("Kunne ikke lese fil"));
    });
}

async function syncOfflineData() {
    if (offlineQueue.length === 0) return;
    
    alert('Synkroniserer data...');
    
    const newQueue = [];
    for (const item of offlineQueue) {
        const { action, id, ...data } = item;
        
        try {
            if (action === 'insert') {
                await firebase.addDoc(firebase.collection(db, "cups"), data);
            } else if (action === 'update') {
                const cupRef = firebase.doc(db, "cups", id);
                await firebase.updateDoc(cupRef, data);
            } else if (action === 'delete') {
                const cupRef = firebase.doc(db, "cups", id);
                await firebase.deleteDoc(cupRef);
            }
        } catch (error) {
            console.error('Sync failed for item', item, error);
            newQueue.push(item);
        }
    }
    
    offlineQueue = newQueue;
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    
    if (offlineQueue.length === 0) {
        alert('Synkronisering fullført!');
        loadCups();
    } else {
        alert('Noe data kunne ikke synkroniseres.');
    }
}

function updateSummary() {
    updateSummaryUI();
}

function updateSummaryUI() {
    // Use filteredCups if available, else cups
    const targetCups = (filteredCups.length > 0 || document.getElementById('search-input')?.value) ? filteredCups : cups;
    
    const totalCount = targetCups.reduce((sum, cup) => sum + (cup.count || 1), 0);
    const totalValue = targetCups.reduce((sum, cup) => sum + ((cup.current_value || 0) * (cup.count || 1)), 0);
    const totalCost = targetCups.reduce((sum, cup) => sum + ((cup.price_paid || 0) * (cup.count || 1)), 0);
    const increase = totalValue - totalCost;

    document.getElementById('stat-count').innerText = totalCount;
    document.getElementById('stat-value').innerText = totalValue.toLocaleString('nb-NO') + ' kr';
    document.getElementById('stat-cost').innerText = totalCost.toLocaleString('nb-NO') + ' kr';
    
    const incEl = document.getElementById('stat-increase');
    incEl.innerText = (increase >= 0 ? '+' : '') + increase.toLocaleString('nb-NO') + ' kr';
    incEl.style.color = increase >= 0 ? 'green' : 'red';
}

function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const targetCups = (filteredCups.length > 0 || document.getElementById('search-input')?.value) ? filteredCups : cups;

    doc.setFontSize(20);
    doc.text("Min Mummikopp Samling", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Generert: ${new Date().toLocaleDateString('nb-NO')}`, 14, 30);
    doc.text(`Antall kopper: ${targetCups.length}`, 14, 36);
    
    const tableData = targetCups.map(cup => {
        const cost = parseFloat(cup.price_paid || 0);
        const val = parseFloat(cup.current_value || 0);
        const diff = val - cost;
        return [
            cup.name,
            cup.series || '-',
            cup.year || '-',
            cost + ' kr',
            val + ' kr',
            (diff >= 0 ? '+' : '') + diff + ' kr'
        ];
    });

    // Calculate totals
    const totalCost = targetCups.reduce((sum, cup) => sum + parseFloat(cup.price_paid || 0), 0);
    const totalValue = targetCups.reduce((sum, cup) => sum + parseFloat(cup.current_value || 0), 0);
    const totalDiff = totalValue - totalCost;

    // Add total row
    tableData.push([
        { content: 'TOTALT', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: totalCost + ' kr', styles: { fontStyle: 'bold' } },
        { content: totalValue + ' kr', styles: { fontStyle: 'bold' } },
        { content: (totalDiff >= 0 ? '+' : '') + totalDiff + ' kr', styles: { fontStyle: 'bold', textColor: totalDiff >= 0 ? [0, 128, 0] : [255, 0, 0] } }
    ]);

    doc.autoTable({
        head: [['Navn', 'Serie', 'År', 'Innkjøp', 'Verdi nå', 'Differanse']],
        body: tableData,
        startY: 40,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80] },
        styles: { fontSize: 10 },
    });
    
    doc.save("mummikopp-samling.pdf");
}

window.generateSinglePDF = function(cupId) {
    const cup = cups.find(c => c.id == cupId);
    if (!cup) return;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.text(cup.name, 14, 20);
    
    doc.setFontSize(12);
    let y = 30;
    
    const details = [
        ['Serie:', cup.series],
        ['År:', cup.year],
        ['Verdi:', `${cup.current_value} kr`],
        ['Notater:', cup.notes]
    ];
    
    details.forEach(([label, value]) => {
        if(value) {
            doc.text(`${label} ${value}`, 14, y);
            y += 10;
        }
    });
    
    doc.save(`${cup.name}_info.pdf`);
}

window.prepareDelete = function(id, event) {
    event.stopPropagation();
    editingId = id;
    handleDeleteCup();
}

window.generateCertificate = async function(cupId) {
    const cup = cups.find(c => c.id == cupId);
    if (!cup) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Exclusive Border
    doc.setLineWidth(3);
    doc.setDrawColor(50, 50, 50);
    doc.rect(10, 10, 190, 277);
    doc.setLineWidth(1);
    doc.rect(15, 15, 180, 267);
    
    // Background tint (optional, maybe light cream if possible, but keep white for print)
    
    // Header
    doc.setFont("times", "bold");
    doc.setFontSize(30);
    doc.setTextColor(50, 50, 50);
    doc.text("Samlersertifikat", 105, 40, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("times", "italic");
    doc.text("Bekreftelse på eierskap i Mummisamling", 105, 50, { align: "center" });
    
    let y = 70;

    // Image
    if (cup.image_url) {
        try {
            // Create an image element to load the URL
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = cup.image_url;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            
            // Calculate aspect ratio to fit in a box (e.g., 80x80)
            const maxSize = 80;
            let w = img.width;
            let h = img.height;
            const ratio = Math.min(maxSize / w, maxSize / h);
            w = w * ratio;
            h = h * ratio;
            
            doc.addImage(img, 'JPEG', 105 - (w/2), y, w, h);
            y += h + 15;
        } catch (e) {
            console.error("Could not load image for PDF", e);
            doc.text("(Bilde kunne ikke lastes)", 105, y + 20, { align: "center" });
            y += 40;
        }
    } else {
        y += 10;
    }
    
    // Cup Name
    doc.setFontSize(24);
    doc.setFont("times", "bold");
    doc.text(cup.name, 105, y, { align: "center" });
    y += 20;

    // Divider line
    doc.setDrawColor(150, 150, 150);
    doc.line(60, y, 150, y);
    y += 20;

    // Details
    const details = [
        ['Serie / Utgave:', cup.series],
        ['Produsentår:', cup.year],
        ['Sjeldenhet:', cup.rarity],
        ['Tilstand:', cup.condition],
        ['Eske:', cup.box ? 'Ja' : 'Nei'],
        ['Verdi:', `${cup.current_value} kr`],
        ['Kjøpsdato:', cup.purchase_date],
        ['Notater:', cup.notes]
    ];

    doc.setFontSize(12);
    doc.setFont("times", "normal");
    
    details.forEach(([label, value]) => {
        if (value) {
            doc.setFont("times", "bold");
            doc.text(`${label}`, 50, y);
            
            doc.setFont("times", "normal");
            const splitValue = doc.splitTextToSize(String(value), 90);
            doc.text(splitValue, 90, y);
            y += 7 * Math.max(1, splitValue.length); // Reduced spacing slightly
        }
    });
    
    // Footer
    // Ensure footer doesn't overlap with content (min Y is 270, but push down if needed)
    y = Math.max(y + 15, 270);
    
    // Check if we ran out of space (page height ~297mm)
    if (y > 285) {
        doc.addPage();
        y = 270;
    }

    doc.setFontSize(10);
    doc.setFont("times", "italic");
    doc.text("Autentisert av Mummikopp Samler App", 105, y, { align: "center" });
    doc.text(`Generert: ${new Date().toLocaleDateString('nb-NO')}`, 105, y + 5, { align: "center" });
    
    doc.save(`${cup.name.replace(/\s+/g, '_')}_sertifikat.pdf`);
}

window.showSection = showSection;
window.setCollectionView = setCollectionView;
window.generatePDF = generatePDF;
window.handleDeleteCup = handleDeleteCup;
window.logout = logout;
let importCupsList = [];

async function showImportView(sourceId) {
    // Hide other sections
    Object.values(views).forEach(el => el.classList.add('hidden'));
    document.getElementById('view-import').classList.remove('hidden');
    
    const container = document.getElementById('import-container');
    container.innerHTML = '<p>Laster kopper for import...</p>';
    
    try {
        const q = firebase.query(firebase.collection(db, "cups"));
        const querySnapshot = await firebase.getDocs(q);
        importCupsList = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.user_id === sourceId) {
                importCupsList.push({ id: doc.id, ...data });
            }
        });
        
        renderImportList();
    } catch (error) {
        console.error("Error loading import cups", error);
        container.innerHTML = '<p>Kunne ikke laste kopper. Prøv igjen.</p>';
    }
}

function renderImportList() {
    const container = document.getElementById('import-container');
    container.innerHTML = '';
    
    if (importCupsList.length === 0) {
        container.innerHTML = '<p>Ingen kopper funnet å importere.</p>';
        return;
    }
    
    importCupsList.forEach(cup => {
        const item = document.createElement('div');
        item.className = 'cup-card'; // Reuse style
        item.style.cursor = 'pointer';
        item.onclick = (e) => {
             // Toggle checkbox if clicking card
             if (e.target.type !== 'checkbox') {
                 const cb = item.querySelector('input[type="checkbox"]');
                 cb.checked = !cb.checked;
             }
        };

        const imgUrl = cup.image_url || 'https://via.placeholder.com/150?text=Ingen+bilde';
        
        item.innerHTML = `
            <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                <input type="checkbox" class="import-checkbox" value="${cup.id}" checked style="width: 25px; height: 25px;">
            </div>
            <img src="${imgUrl}" class="cup-img" alt="${cup.name}" loading="lazy">
            <div class="cup-info">
                <h3 class="cup-name">${cup.name}</h3>
                <div class="cup-meta">
                    ${cup.series ? `<span>${cup.series}</span><br>` : ''}
                    <span>${cup.year || '?'}</span>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

function toggleImportAll(source) {
    const checkboxes = document.querySelectorAll('.import-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

async function executeImport() {
    if (!currentUser) return;
    
    const checkboxes = document.querySelectorAll('.import-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Du må velge minst én kopp.");
        return;
    }
    
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    const cupsToImport = importCupsList.filter(c => selectedIds.includes(c.id));
    
    if (!confirm(`Vil du importere ${cupsToImport.length} kopper til din samling?`)) return;
    
    const btn = document.querySelector('.import-buttons .primary-btn');
    const originalText = btn.innerText;
    btn.innerText = "Importerer...";
    btn.disabled = true;
    
    try {
        let importedCount = 0;
        
        // Process in chunks to avoid overwhelming browser/network
        for (const cup of cupsToImport) {
            const { id, user_id, ...cupData } = cup; // Exclude ID and old user_id
            
            const newCup = {
                ...cupData,
                user_id: currentUser.uid,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'collection' // Default status
            };
            
            await firebase.addDoc(firebase.collection(db, "cups"), newCup);
            importedCount++;
        }
        
        alert(`Suksess! ${importedCount} kopper ble importert.`);
        sessionStorage.removeItem('import_source_id');
        showSection('view-collection');
        
    } catch (error) {
        console.error("Import failed", error);
        alert("Noe gikk galt under importen: " + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function cancelImport() {
    sessionStorage.removeItem('import_source_id');
    showSection('view-collection');
}

window.showImportView = showImportView;
window.toggleImportAll = toggleImportAll;
window.executeImport = executeImport;
window.cancelImport = cancelImport;
window.shareCollection = shareCollection;

async function forceUpdateApp() {
    if (!confirm('Dette vil tvinge en oppdatering av appen. Alle midlertidige data slettes og siden lastes på nytt. Er du sikker?')) return;
    
    alert("Oppdaterer... vent litt.");
    
    // 1. Unregister Service Workers
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
            await registration.unregister();
        }
    }
    
    // 2. Clear Caches
    if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
            await caches.delete(key);
        }
    }
    
    // 3. Force Reload
    window.location.reload(true);
}
window.forceUpdateApp = forceUpdateApp;
