const CACHE_NAME = 'mummi-cache-v3';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon.png',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force new service worker to activate immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).then((fetchResponse) => {
                // Cache new requests dynamically (e.g. user images if possible, but careful with storage)
                // For now, only return fetch if not in cache
                return fetchResponse;
            });
        }).catch(() => {
            // Fallback for offline if not in cache
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all clients immediately
    );
});
