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
    
    showSection('view-collection');
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
        homeBtn.innerText = 'Lag din egen samling';
        homeBtn.onclick = () => window.location.href = window.location.pathname;
        homeBtn.style.cssText = "margin-top: 10px; padding: 5px 10px; cursor: pointer;";
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
    if (isSharedView) return;
    
    if (!currentUser) {
        alert('Du må være logget inn for å lagre.');
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
        if (!navigator.onLine) {
            alert('Kan ikke laste opp bilde mens du er offline. Prøv igjen senere.');
            return;
        }
        try {
            // Sanitize filename to avoid path issues
            const safeName = imageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileName = `${currentUser.uid}/${Date.now()}_${safeName}`;
            const storageRef = firebase.ref(storage, 'cup-images/' + fileName);
            
            console.log("Starting upload...", fileName);
            await firebase.uploadBytes(storageRef, imageFile);
            console.log("Upload complete, getting URL...");
            imageUrl = await firebase.getDownloadURL(storageRef);
            console.log("Image URL obtained:", imageUrl);
        } catch (err) {
            console.error('Upload error detailed:', err);
            
            let errorMsg = 'Feil ved opplasting av bilde: ' + err.message;
            if (err.code === 'storage/unauthorized' || err.message.includes('unauthorized')) {
                errorMsg = 'Mangler tilgang til å laste opp bilder. Sjekk Storage Rules i Firebase Console.';
            } else if (err.message.includes('ERR_FAILED')) {
                 errorMsg = 'Nettverksfeil ved opplasting (mulig CORS/Adblock).';
            }

            if (confirm(`${errorMsg}\n\nVil du lagre koppen UTEN bilde?`)) {
                imageUrl = null; // Proceed without image
            } else {
                return; // Stop saving
            }
        }
    }

    if (imageUrl) {
        formData.image_url = imageUrl;
    }

    if (navigator.onLine) {
        try {
            console.log("Saving to Firestore...", formData);
            if (editingId) {
                const cupRef = firebase.doc(db, "cups", editingId);
                await firebase.updateDoc(cupRef, formData);
                console.log("Update success");
            } else {
                const docRef = await firebase.addDoc(firebase.collection(db, "cups"), formData);
                console.log("Add success, ID:", docRef.id);
            }
            alert('Kopp lagret!');
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
}

async function handleDeleteCup() {
    if (!editingId) return;
    
    if (!confirm('Er du sikker på at du vil slette denne koppen? Dette kan ikke angres.')) {
        return;
    }

    if (navigator.onLine) {
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
    
    const tableData = targetCups.map(cup => [
        cup.name,
        cup.series || '-',
        cup.year || '-',
        cup.rarity || '-',
        (cup.current_value || 0) + ' kr'
    ]);

    doc.autoTable({
        head: [['Navn', 'Serie', 'År', 'Sjeldenhet', 'Verdi']],
        body: tableData,
        startY: 40,
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
            y += 8 * Math.max(1, splitValue.length);
        }
    });
    
    // Footer
    y = 260;
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
window.shareCollection = shareCollection;
