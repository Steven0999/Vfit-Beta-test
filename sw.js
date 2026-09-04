importScripts(
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js'
);

const CACHE_VERSION = 'vfit-2.1.0-beta.4';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vfit-config.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

const OPTIONAL_LIBRARIES = [
  'https://cdn.tailwindcss.com/',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/lucide@1.39.0/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check-compat.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

const PRIVATE_NETWORK_HOSTS = [
  'googleapis.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'openfoodfacts.org',
  'world.openfoodfacts.org',
  'uk.openfoodfacts.org',
  'api.nal.usda.gov',
  'cloudfunctions.net'
];

firebase.initializeApp({
  apiKey: 'AIzaSyA9H9hmvfrQmc2wIwnS2jCPLgdmXBquQXM',
  authDomain: 'vfit-app-pro.firebaseapp.com',
  projectId: 'vfit-app-pro',
  storageBucket: 'vfit-app-pro.firebasestorage.app',
  messagingSenderId: '815730068689',
  appId: '1:815730068689:web:0c6587d7dbe62b0f3c09f0'
});

try {
  const backgroundMessaging = firebase.messaging();
  backgroundMessaging.onBackgroundMessage(payload => {
    const data = payload && payload.data ? payload.data : {};
    const title = String(data.title || 'VFIT').slice(0, 80);
    const body = String(data.body || 'You have a new VFIT update').slice(0, 180);
    self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'vfit-update',
      data: { url: String(data.url || './').slice(0, 300) }
    });
  });
} catch (error) {
  console.warn('VFIT background messaging is not configured:', error);
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => client.url.startsWith(self.location.origin));
    if (existing) return existing.focus().then(() => existing.navigate(target));
    return clients.openWindow(target);
  }));
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        await Promise.allSettled(OPTIONAL_LIBRARIES.map(async url => {
          const request = new Request(url, { mode: 'no-cors', cache: 'reload' });
          const response = await fetch(request);
          await cache.put(request, response);
        }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('vfit-') && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('./index.html', response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) || (await caches.match('./index.html')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Authentication, personal Firestore records, and live nutrition lookups are
  // network-only. The service worker never writes these responses to Cache API.
  if (PRIVATE_NETWORK_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isLocal = url.origin === self.location.origin;
  const isStaticLibrary = [
    'cdn.tailwindcss.com',
    'unpkg.com',
    'cdn.jsdelivr.net',
    'www.gstatic.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ].includes(url.hostname);
  if (isLocal || isStaticLibrary) event.respondWith(staleWhileRevalidate(request));
});
