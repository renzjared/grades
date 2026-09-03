const SUPABASE_URL = 'https://hjpihzsdebckouckxewi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqcGloenNkZWJja291Y2t4ZXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODY2NjYsImV4cCI6MjA5NTQ2MjY2Nn0.XyXSuxb51G_08PLgrKwt1RvYmVwgIajqCnMWuS_V82c';

// 1. The Offline Vault & Queue System
window.OfflineSync = {
    db: null,
    async init() {
        return new Promise((resolve) => {
            const req = indexedDB.open('TalaOffline', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('get_cache')) db.createObjectStore('get_cache', { keyPath: 'url' });
                if (!db.objectStoreNames.contains('mutation_queue')) db.createObjectStore('mutation_queue', { keyPath: 'id', autoIncrement: true });
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
        });
    },
    async cacheGet(url, data) {
        const tx = this.db.transaction('get_cache', 'readwrite');
        tx.objectStore('get_cache').put({ url, data, timestamp: Date.now() });
    },
    async getCached(url) {
        return new Promise((resolve) => {
            const tx = this.db.transaction('get_cache', 'readonly');
            const req = tx.objectStore('get_cache').get(url);
            req.onsuccess = () => resolve(req.result ? req.result.data : null);
        });
    },
    async queueMutation(url, options) {
        const tx = this.db.transaction('mutation_queue', 'readwrite');
        // Strip auth headers; we will generate fresh ones when syncing back online
        const { Authorization, apikey, ...safeHeaders } = options.headers || {};
        tx.objectStore('mutation_queue').add({
            url, method: options.method, body: options.body, headers: safeHeaders, timestamp: Date.now()
        });
    },
    async processQueue() {
        if (!navigator.onLine) return;
        const tx = this.db.transaction('mutation_queue', 'readonly');
        const req = tx.objectStore('mutation_queue').getAll();
        
        req.onsuccess = async () => {
            const queue = req.result;
            if (queue.length === 0) return;

            console.log(`Syncing ${queue.length} offline changes...`);
            const { data: { session } } = await window.realSupabaseClient.auth.getSession();

            for (const item of queue) {
                try {
                    // Rebuild the request with a fresh authentication token
                    const headers = { 
                        ...item.headers, 
                        'Authorization': `Bearer ${session?.access_token}`, 
                        'apikey': SUPABASE_KEY 
                    };
                    await fetch(item.url, { method: item.method, body: item.body, headers });

                    // Clear from queue after successful push
                    const delTx = this.db.transaction('mutation_queue', 'readwrite');
                    delTx.objectStore('mutation_queue').delete(item.id);
                } catch (e) {
                    console.error('Sync failed, halting to preserve order:', e);
                    break; 
                }
            }
            
            // Refresh the UI to pull down fresh data (like Task B) from the server
            if (typeof fetchTermData === 'function' && window.AcadState?.activeTerm) {
                fetchTermData(window.AcadState.activeTerm.id);
            }
        };
    }
};

window.OfflineSync.init();

// 2. The Network Interceptor
const offlineCapableFetch = async (url, options) => {
    if (navigator.onLine) {
        try {
            const response = await fetch(url, options);
            // If it's a successful read request, cache the exact payload for later offline use
            if (options.method === 'GET' && response.ok) {
                const data = await response.clone().json();
                await window.OfflineSync.cacheGet(url, data);
            }
            return response;
        } catch (err) {
            console.warn("Network failed mid-flight, falling back to offline mode.");
        }
    }

    // --- OFFLINE MODE ROUTING ---
    if (options.method === 'GET') {
        const cached = await window.OfflineSync.getCached(url);
        return new Response(JSON.stringify(cached || []), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } else {
        // It's a write (Insert/Update/Delete). Drop it in the outbox.
        await window.OfflineSync.queueMutation(url, options);

        // Return a mock success response so the frontend `.update()` or `.insert()` promises don't throw errors
        let fakeData = [{}];
        try { if (options.body) fakeData = [JSON.parse(options.body)]; } catch(e){}
        if (!fakeData[0].id) fakeData[0].id = 'temp_' + Date.now(); // Provide a temp ID just in case the UI needs it immediately
        
        return new Response(JSON.stringify(fakeData), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
};

// 3. Redefine the Clients
// Give the real client a unique storage key to prevent collision warnings
window.realSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storageKey: 'supabase-real-auth' }
});

// We redefine the primary client used by the rest of your app, injecting our interceptor
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { fetch: offlineCapableFetch }
});

function generateId() { 
    return Math.random().toString(36).substr(2, 9); 
}

// 4. Trigger sync automatically when the browser detects a connection
window.addEventListener('online', () => window.OfflineSync.processQueue());