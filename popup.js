// ===================================================================
// OVH API CONFIG (Web Cloud)
// ===================================================================
// Ganti ini dengan domain API di hosting OVH Anda
const API_BASE = 'https://saligia.app/api/'; // contoh: https://example.com/api

// Shim minimal untuk kompatibilitas kode lama yang memakai Firebase FieldValue
const firebase = {
    firestore: {
        FieldValue: {
            arrayUnion: (...items) => ({ _op: 'union', items }),
            arrayRemove: (...items) => ({ _op: 'remove', items })
        }
    }
};

// Penyimpanan token + helper fetch
let apiToken = null;
let currentUser = null; // { uid, email }
let authReady = false; // UI hanya berubah setelah ini true
// Menyimpan keyword id aktif untuk whitelist; harus dideklarasikan agar aman saat popup re-open
let currentKeywordId = null;
// Menandai transisi logout agar UI menampilkan overlay yang rapi
let pendingLogout = false;
let pendingLogin = false;

async function loadToken() {
    const { apiToken: t } = await chrome.storage.local.get('apiToken');
    apiToken = t || null;
}

async function saveToken(t) {
    apiToken = t;
    if (t) {
        await chrome.storage.local.set({ apiToken: t });
    } else {
        await chrome.storage.local.remove('apiToken');
    }
}

async function apiRequest(path, { method = 'GET', body = null } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;

    // Gabungkan base URL + path tanpa double slash supaya rewrite di server bekerja.
    const base = API_BASE.replace(/\/+$/, '');
    const normalizedPath = path.replace(/^\/+/, '');
    const url = `${base}/${normalizedPath}`;

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${method} ${path} gagal: ${res.status} ${text}`);
    }
    return res.json();
}

// API wrapper
async function apiLogin(email, password) {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    // Harapkan response: { token, user: { id, email } }
    await saveToken(data.token);
    currentUser = { uid: data.user.id, email: data.user.email };
    return currentUser;
}

async function apiLogout() {
    await saveToken(null);
    currentUser = null;
}

async function apiMe() {
    if (!apiToken) return null;
    try {
        const data = await apiRequest('/auth/me'); // { id, email }
        currentUser = { uid: data.id, email: data.email };
        return currentUser;
    } catch {
        await saveToken(null);
        return null;
    }
}

// Keywords + Whitelist by keyword_id (sesuai skema MySQL Anda)
async function apiUpsertKeyword(keyword) {
    return apiRequest('/keywords/upsert', { method: 'POST', body: { keyword } }); // -> { id, keyword }
}

async function apiListKeywords() {
    return apiRequest('/keywords'); // -> [ { id, keyword, count } ]
}

async function apiGetWhitelist(keywordId) {
    return apiRequest(`/whitelist?keyword_id=${encodeURIComponent(keywordId)}`); // -> [ { url, domain, note } ]
}

async function apiAddWhitelistByKeyword(keywordId, urls) {
    return apiRequest('/whitelist/add', { method: 'POST', body: { keyword_id: keywordId, urls } });
}

async function apiRemoveWhitelistByKeyword(keywordId, url) {
    return apiRequest('/whitelist/remove', { method: 'POST', body: { keyword_id: keywordId, url } });
}

// Shim auth/db agar kode lama tetap bekerja dengan perubahan minimal
const auth = {
    _listeners: [],
    get currentUser() { return currentUser; },
    async signInWithEmailAndPassword(email, password) {
        await apiLogin(email, password);
        this._notify();
    },
    async signOut() {
        await apiLogout();
        this._notify();
    },
    onAuthStateChanged(cb) {
        this._listeners.push(cb);
        cb(currentUser);
    },
    _notify() { this._listeners.forEach(cb => cb(currentUser)); }
};

// db shim tak lagi digunakan untuk whitelist; dibiarkan kosong bila diperlukan di masa depan

// --- Dapatkan semua elemen dari DOM ---
const getLinksButton = document.getElementById('getLinksButton');
const resultsDiv = document.getElementById('results');
const copyContainer = document.getElementById('copyContainer');
const copyReportButton = document.getElementById('copyReportButton');
const copyLinksButton = document.getElementById('copyLinksButton');
const searchQueryDisplay = document.getElementById('searchQuery');
const resetButton = document.getElementById('resetButton');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const mainAppContainer = document.getElementById('mainAppContainer');
const loginNotice = document.getElementById('loginNotice');
const viewWhitelistButton = document.getElementById('viewWhitelistButton');
const filterContainer = document.getElementById('filterContainer');
const filterInput = document.getElementById('filterInput');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMessage = document.getElementById('loadingMessage');
const container = document.querySelector('.container');

let fullScrapedData = null;

// Inisialisasi auth dari token tersimpan
(async () => {
    await loadToken();
    await apiMe();
    // Beri tahu listener jika status user berubah setelah pemuatan token
    if (typeof auth !== 'undefined' && auth._notify) {
        authReady = true;
        auth._notify();
    }
})();

// ========================================================
// CACHE SEDERHANA (TTL) UNTUK WHITELIST
// ========================================================
async function getWhitelistWithCache(keywordId) {
    if (!keywordId) return [];
    const { whitelistCache = {} } = await chrome.storage.local.get('whitelistCache');
    const now = Date.now();
    const TTL = 10 * 60 * 1000; // 10 menit
    const entry = whitelistCache[String(keywordId)];
    if (entry && (now - entry.ts) < TTL) {
        return Array.isArray(entry.items) ? entry.items : [];
    }
    const items = await apiGetWhitelist(keywordId);
    whitelistCache[String(keywordId)] = { items, ts: now };
    await chrome.storage.local.set({ whitelistCache });
    return Array.isArray(items) ? items : [];
}

async function getUmumKeywordIdCached() {
    const { umumKeywordIdCache } = await chrome.storage.local.get('umumKeywordIdCache');
    const now = Date.now();
    const TTL = 24 * 60 * 60 * 1000; // 24 jam
    if (umumKeywordIdCache && (now - (umumKeywordIdCache.ts || 0)) < TTL) {
        return umumKeywordIdCache.id || null;
    }
    const keywords = await apiListKeywords().catch(() => []);
    const umumEntry = Array.isArray(keywords)
        ? keywords.find(k => (k.keyword || '').trim().toLowerCase() === 'umum')
        : null;
    const id = umumEntry ? umumEntry.id : null;
    await chrome.storage.local.set({ umumKeywordIdCache: { id, ts: now } });
    return id;
}

// ========================================================
// FUNGSI HELPER
// ========================================================
function normalizeUrl(urlString) {
    if (!urlString) return null;
    const trimmed = urlString.trim();
    if (!trimmed || trimmed.toUpperCase() === 'N/A') { return null; }

    const buildNormalized = (urlObj) => {
        let hostname = urlObj.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        const pathname = urlObj.pathname || '/';
        return `${urlObj.protocol}//${hostname}${pathname}${urlObj.search}${urlObj.hash}`;
    };

    try {
        return buildNormalized(new URL(trimmed));
    } catch (firstError) {
        try {
            return buildNormalized(new URL(`https://${trimmed}`));
        } catch (secondError) {
            return trimmed;
        }
    }
}

function extractHostname(urlString) {
    if (!urlString) return null;
    const trimmed = urlString.trim();
    if (!trimmed) return null;
    try {
        const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
        let hostname = url.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        return hostname;
    } catch (e) {
        return trimmed.replace(/^www\./, '');
    }
}

// Cocokkan host terhadap set whitelist, termasuk subdomain.
function hostInSet(hostname, set) {
    if (!hostname || !set) return false;
    let h = String(hostname).toLowerCase();
    if (set.has(h)) return true;
    // Naikkan ke parent domain (id.linkedin.com -> linkedin.com)
    let dot = h.indexOf('.');
    while (dot > 0) {
        h = h.substring(dot + 1);
        if (set.has(h)) return true;
        dot = h.indexOf('.');
    }
    return false;
}

// ========================================================
// FUNGSI PENGATUR TAMPILAN
// ========================================================
function showLoggedInState(user) {
    document.body.classList.add('logged-in');
    document.body.classList.remove('logged-out');
    userEmail.textContent = user.email;
    chrome.storage.local.get('scrapeData', ({ scrapeData }) => {
        fullScrapedData = scrapeData;
        renderUI(scrapeData);
    });
}

function showLoggedOutState() {
    document.body.classList.add('logged-out');
    document.body.classList.remove('logged-in');
    userEmail.textContent = '';
    fullScrapedData = null; 
    renderUI(null);
}

// --- PERUBAHAN UTAMA DI FUNGSI INI ---
function renderUI(data, customEmptyMessage = null) {
    if (!auth.currentUser) { return; }
    
    if (!data || !data.links || data.links.length === 0) {
        if (customEmptyMessage) {
            resultsDiv.innerHTML = `<p>${customEmptyMessage}</p>`;
        } else if (fullScrapedData && fullScrapedData.links.length > 0) {
            resultsDiv.innerHTML = '<p>Tidak ada link yang cocok dengan pencarian Anda.</p>';
        } else {
            resultsDiv.innerHTML = '<p>Klik "Ambil Link" untuk memulai.</p>';
        }

        if (fullScrapedData && fullScrapedData.query) {
            searchQueryDisplay.textContent = `Kueri: "${fullScrapedData.query}"`;
            searchQueryDisplay.classList.remove('hidden');
            resetButton.classList.remove('hidden');
            filterContainer.classList.remove('hidden');
        } else {
             searchQueryDisplay.classList.add('hidden');
             resetButton.classList.add('hidden');
             filterContainer.classList.add('hidden');
        }
        copyContainer.classList.add('hidden');
        return;
    }

    const { query, links } = data;
    searchQueryDisplay.textContent = `Kueri: "${query}"`;
    searchQueryDisplay.classList.remove('hidden');

    let htmlResult = '';
    links.forEach((linkItem) => {
        // Menambahkan div pembungkus dengan gaya "card"
        htmlResult += `
            <div class="result-item" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                
                <div style="color: #1a0dab; font-weight: bold; margin-bottom: 5px; font-size: 1.1em;">
                    ${linkItem.title || 'Tanpa Judul'}
                </div>

                <div style="margin-bottom: 8px;">
                    <strong style="display: block; font-size: 0.8em; color: #5f6368;">MAIN LINK:</strong>
                    <div class="link-row">
                        <span class="link-url">${linkItem.mainLink}</span>
                        <button class="action-icon whitelist-button" data-url="${linkItem.mainLink}" title="Tambahkan ke Whitelist" aria-label="Tambahkan ke whitelist">+</button>
                        <button class="action-icon visit-link-button" data-variant="main" data-url="${linkItem.mainLink}" title="Kunjungi Main Link" aria-label="Kunjungi main link">&#128640;</button>
                        <span class="whitelist-status"></span>
                    </div>
                </div>`;
        
        // Bagian AMP Link (hanya jika ada)
        if (linkItem.ampLink) {
            htmlResult += `
                <div>
                    <strong style="display: block; font-size: 0.8em; color: #5f6368;">AMP LINK:</strong>
                    <div class="link-row">
                        <span class="link-url">${linkItem.ampLink}</span>
                        <button class="action-icon whitelist-button" data-url="${linkItem.ampLink}" title="Tambahkan ke Whitelist" aria-label="Tambahkan ke whitelist">+</button>
                        <button class="action-icon visit-link-button" data-variant="amp" data-url="${linkItem.ampLink}" title="Kunjungi AMP Link" aria-label="Kunjungi AMP link">&#9889;</button>
                        <span class="whitelist-status"></span>
                    </div>
                </div>`;
        }
        
        htmlResult += `</div>`; // Penutup div .result-item
    });
    resultsDiv.innerHTML = htmlResult;

    document.querySelectorAll('.visit-link-button').forEach(btn => btn.addEventListener('click', visitLink));
    document.querySelectorAll('.whitelist-button').forEach(btn => btn.addEventListener('click', whitelistLink));

    copyContainer.classList.remove('hidden');
    resetButton.classList.remove('hidden');
    filterContainer.classList.remove('hidden');
}


// ========================================================
// LOGIKA INTI APLIKASI
// ========================================================
async function scrapeDataOnPage() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const loadMoreLabels = [
        'hasil penelusuran lainnya',
        'lihat hasil lain',
        'lihat hasil penelusuran lainnya',
        'more results',
        'more search results',
        'load more results'
    ];
    const buttonAttempts = new WeakMap();

    const labelMatches = (text) => {
        if (!text) return false;
        return loadMoreLabels.some(label => text === label || text.startsWith(`${label} `));
    };

    const isElementVisible = (el) => {
        if (!el) return false;
        if (el.offsetParent === null) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(el);
        if (!style) return true;
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
        return true;
    };

    const queryInput = document.querySelector('textarea[name="q"], input[name="q"]');
    const query = queryInput ? queryInput.value : '';

    const getResultBlocks = () => {
        const blocks = Array.from(document.querySelectorAll('.MjjYud'));
        return blocks.length > 0 ? blocks : Array.from(document.querySelectorAll('.g'));
    };

    const findLoadMoreButton = () => {
        const selectors = 'button, a[role="button"], div[role="button"], span[role="button"]';
        const candidates = Array.from(document.querySelectorAll(selectors));
        return candidates.find((el) => {
            if (el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')) return false;
            const text = normalize(el.innerText || el.textContent);
            const aria = normalize(el.getAttribute('aria-label') || '');
            const matched = labelMatches(text) || labelMatches(aria);
            if (!matched) return false;
            if (!isElementVisible(el)) return false;
            const tries = buttonAttempts.get(el) || 0;
            if (tries >= 5) return false;
            return true;
        }) || null;
    };

    const waitForNewResults = async (previousCount, previousHeight) => {
        const maxWaitMs = 7000;
        const tickMs = 250;
        const start = performance.now();
        while ((performance.now() - start) < maxWaitMs) {
            await sleep(tickMs);
            const currentCount = getResultBlocks().length;
            const currentHeight = document.documentElement ? document.documentElement.scrollHeight : document.body.scrollHeight;
            if (currentCount > previousCount || currentHeight > previousHeight + 50) {
                return 'grown';
            }
        }
        return 'timeout';
    };

    // Automatically expand "More results" sections on mobile SERP
    for (let clickAttempts = 0; clickAttempts < 30; clickAttempts++) {
        const button = findLoadMoreButton();
        if (!button) break;

        const previousCount = getResultBlocks().length;
        const previousHeight = document.documentElement ? document.documentElement.scrollHeight : document.body.scrollHeight;
        let success = false;
        for (let retry = 0; retry < 5; retry++) {
            buttonAttempts.set(button, (buttonAttempts.get(button) || 0) + 1);
            button.scrollIntoView({ block: 'center' });
            button.dataset.scrapereAutoload = 'true';
            button.click();
            const waitResult = await waitForNewResults(previousCount, previousHeight);
            if (waitResult === 'grown') {
                success = true;
                buttonAttempts.delete(button);
                break;
            }
            await sleep(200);
            if (!document.contains(button) || !isElementVisible(button)) {
                break;
            }
        }

        if (!success) {
            const anotherButton = findLoadMoreButton();
            if (!anotherButton) {
                break;
            }
            if (anotherButton === button && (buttonAttempts.get(button) || 0) >= 5) {
                break;
            }
            continue;
        }

        await sleep(200);
    }

    const scrapedData = [];
    const seenLinks = new Set();
    for (const block of getResultBlocks()) {
        const linkElement =
            block.querySelector('h3 a') ||
            block.querySelector('.yuRUbf a') ||
            block.querySelector('a');
        const titleElement = block.querySelector('h3, div[role="heading"][aria-level="3"]');

        if (!linkElement || !linkElement.href) continue;

        const mainLink = linkElement.href;
        if (seenLinks.has(mainLink)) continue;
        seenLinks.add(mainLink);

        const title = titleElement ? titleElement.innerText.trim() : 'Judul tidak ditemukan';
        scrapedData.push({
            title: title,
            mainLink,
            ampLink: linkElement.getAttribute('data-amp')
        });
    }

    return { query, links: scrapedData };
}

async function getLinksAndFilter() {
    resultsDiv.innerHTML = 'Mengambil link dari halaman SERP...';
    const user = auth.currentUser;
    if (!user) { alert("Anda harus login terlebih dahulu."); return; }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.includes("google.com/search")) {
        resultsDiv.innerHTML = '<div class="error">Hanya berfungsi di halaman Google Search.</div>';
        return;
    }
    
    const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapeDataOnPage
    });

    const scrapeResult = injectionResults[0].result;
    if (scrapeResult) {
        const activeQuery = (scrapeResult.query || '').trim();
        try {
            const up = await apiUpsertKeyword(activeQuery || 'Umum');
            currentKeywordId = up.id;
        } catch (e) {
            console.error('Gagal upsert keyword:', e);
            resultsDiv.innerHTML = '<div class="error">Gagal mendaftarkan keyword di server.</div>';
            return;
        }

        let flatWhitelist = [];
        try {
            // 1) Ambil whitelist untuk kueri aktif (dengan cache)
            const wlActive = await getWhitelistWithCache(currentKeywordId);
            flatWhitelist = Array.isArray(wlActive) ? wlActive.map(x => x.url || x.domain || '').filter(Boolean) : [];

            // 2) Tambah whitelist "umum" (global) bila ada (cache)
            const umumId = await getUmumKeywordIdCached();
            if (umumId && umumId !== currentKeywordId) {
                const wlUmum = await getWhitelistWithCache(umumId);
                const extra = Array.isArray(wlUmum) ? wlUmum.map(x => x.url || x.domain || '').filter(Boolean) : [];
                flatWhitelist = flatWhitelist.concat(extra);
            }
        } catch (e) {
            console.error('Gagal mengambil whitelist:', e);
        }

        const whitelistedUrlSet = new Set();
        const whitelistedHostSet = new Set();
        flatWhitelist.forEach(url => {
            const trimmedUrl = (url || '').trim();
            if (trimmedUrl) {
                whitelistedUrlSet.add(trimmedUrl);
                const trimmedHost = extractHostname(trimmedUrl);
                if (trimmedHost) {
                    whitelistedHostSet.add(trimmedHost);
                }
            }
            const normalizedUrl = normalizeUrl(trimmedUrl);
            if (normalizedUrl) {
                whitelistedUrlSet.add(normalizedUrl);
                const normalizedHost = extractHostname(normalizedUrl);
                if (normalizedHost) {
                    whitelistedHostSet.add(normalizedHost);
                }
            }
        });

        scrapeResult.links = scrapeResult.links.filter(linkItem => {
            const rawMainLink = (linkItem.mainLink || '').trim();
            const rawAmpLink = (linkItem.ampLink || '').trim();
            const normalizedMainLink = normalizeUrl(rawMainLink);
            const normalizedAmpLink = normalizeUrl(rawAmpLink);
            const mainHostname = extractHostname(rawMainLink);
            const ampHostname = extractHostname(rawAmpLink);

            const isWhitelisted =
                (normalizedMainLink && whitelistedUrlSet.has(normalizedMainLink)) ||
                (normalizedAmpLink && whitelistedUrlSet.has(normalizedAmpLink)) ||
                (rawMainLink && whitelistedUrlSet.has(rawMainLink)) ||
                (rawAmpLink && whitelistedUrlSet.has(rawAmpLink)) ||
                hostInSet(mainHostname, whitelistedHostSet) ||
                hostInSet(ampHostname, whitelistedHostSet);

            return !isWhitelisted;
        });
        
        fullScrapedData = scrapeResult;
        chrome.storage.local.set({ scrapeData: scrapeResult }, () => {
            renderUI(scrapeResult);
            filterInput.value = '';
        });
    } else {
        resultsDiv.innerHTML = '<div class="error">Gagal mengambil data dari halaman.</div>';
    }
}

// ========================================================
// LOGIKA TOMBOL & AKSI
// ========================================================
auth.onAuthStateChanged(user => {
    // Jangan mengubah UI sebelum status auth siap agar tidak mem-flash login form
    if (!authReady) return;
    // Saat logout sedang berlangsung, biarkan overlay tetap tampil hingga handler menyelesaikan
    if (pendingLogout || pendingLogin) return;
    if (user) {
        showLoggedInState(user);
    } else {
        showLoggedOutState();
    }
    loadingOverlay.classList.add('hidden');
    container.style.visibility = 'visible';
});

loginButton.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        alert("Mohon isi email dan password.");
        return;
    }

    pendingLogin = true;
    container.style.visibility = 'hidden';
    loadingMessage.textContent = "Menyambungkan...";
    loadingOverlay.classList.remove('hidden');

    auth.signInWithEmailAndPassword(email, password)
        .then(async () => {
            // Tampilkan countdown sukses sebelum masuk
            try { loadingMessage.classList.remove('loading-error'); } catch {}
            loadingMessage.classList.add('loading-success');
            await runCountdown('Login berhasil. Anda akan diarahkan masuk ke aplikasi dalam', 3);
            showLoggedInState(currentUser);
            loadingOverlay.classList.add('hidden');
            container.style.visibility = 'visible';
            pendingLogin = false;
        })
        .catch(async (error) => {
            const msg = (error && error.message ? String(error.message) : '').toLowerCase();
            let friendly = 'Terjadi kesalahan saat login.';
            if (msg.includes('401') || msg.includes('invalid_credentials')) {
                friendly = 'Email atau Password yang Anda masukkan salah. Anda akan diarahkan kembali ke halaman login dalam';
            }
            try { loadingMessage.classList.remove('loading-success'); } catch {}
            loadingMessage.classList.add('loading-error');
            await runCountdown(friendly, 3);
            passwordInput.value = '';
            showLoggedOutState();
            loadingOverlay.classList.add('hidden');
            container.style.visibility = 'visible';
            pendingLogin = false;
        });
});

// Helper: tampilkan hitung mundur 3..2..1 dalam overlay
async function runCountdown(prefixText, seconds) {
    return new Promise((resolve) => {
        let left = seconds;
        const update = () => {
            loadingMessage.textContent = `${prefixText} ${left}`;
        };
        update();
        const iv = setInterval(() => {
            left -= 1;
            if (left <= 0) {
                clearInterval(iv);
                resolve();
            } else {
                update();
            }
        }, 1000);
    });
}

logoutButton.addEventListener('click', () => {
    pendingLogout = true;
    container.style.visibility = 'hidden';
    loadingMessage.textContent = "Mengakhiri sesi...";
    loadingOverlay.classList.remove('hidden');

    auth.signOut().then(async () => {
        // Bersihkan data lokal
        await chrome.storage.local.remove(['scrapeData', 'whitelistCache', 'umumKeywordIdCache', 'apiToken']);
        fullScrapedData = null;
        currentKeywordId = null;
        filterInput.value = '';
        // Tampilkan layar selesai secara halus
        setTimeout(() => {
            showLoggedOutState();
            loadingOverlay.classList.add('hidden');
            container.style.visibility = 'visible';
            pendingLogout = false;
        }, 600);
    });
});

getLinksButton.addEventListener('click', getLinksAndFilter);

function resetData() {
    chrome.storage.local.remove('scrapeData', () => {
        fullScrapedData = null;
        filterInput.value = '';
        renderUI(null);
    });
}
resetButton.addEventListener('click', resetData);

function visitLink(event) {
    const urlToOpen = event.target.dataset.url;
    if (urlToOpen) chrome.tabs.create({ url: urlToOpen });
}

async function whitelistLink(event) {
    const user = auth.currentUser;
    if (!user) return;
    const button = event.currentTarget || event.target;
    if (!button) return;
    const state = button.dataset.pending;
    if (state === 'busy' || state === 'done') return;

    if (!button.dataset.iconContent) {
        button.dataset.iconContent = button.innerHTML;
    } else if (button.innerHTML !== button.dataset.iconContent) {
        button.innerHTML = button.dataset.iconContent;
    }

    const row = button.closest('.link-row');
    const statusEl = row ? row.querySelector('.whitelist-status') : null;
    const setStatus = (variant, text) => {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.classList.remove('active', 'progress', 'success', 'info', 'error');
        if (text) {
            statusEl.classList.add('active');
            if (variant) statusEl.classList.add(variant);
        }
    };
    const resetClasses = () => {
        button.classList.remove('is-loading', 'is-success', 'is-info', 'is-error');
    };

    button.dataset.pending = 'busy';
    button.disabled = true;
    resetClasses();
    button.classList.add('is-loading');
    setStatus('progress', 'Menambahkan...');

    const urlToWhitelist = (button.dataset.url || '').trim();
    if (!urlToWhitelist) {
        resetClasses();
        button.disabled = false;
        delete button.dataset.pending;
        setStatus('error', 'URL tidak valid');
        return;
    }
    const normalizedUrl = normalizeUrl(urlToWhitelist);
    const hostnameOnly = extractHostname(normalizedUrl || urlToWhitelist);
    const normalizedHost = hostnameOnly ? hostnameOnly.toLowerCase() : null;
    const valueToSave = (normalizedHost || normalizedUrl || urlToWhitelist).trim();
    const valueToSaveLower = valueToSave.toLowerCase();

    try {
        const { scrapeData } = await chrome.storage.local.get('scrapeData');
        const queryAsCategory = scrapeData ? (scrapeData.query || '').trim() : 'Umum';
        if (!currentKeywordId) {
            const up = await apiUpsertKeyword(queryAsCategory);
            currentKeywordId = up.id;
        }

        let alreadyExists = false;
        try {
            const existingItems = await getWhitelistWithCache(currentKeywordId);
            if (Array.isArray(existingItems)) {
                alreadyExists = existingItems.some(item => {
                    const raw = item && (item.url || item.domain) ? String(item.url || item.domain).trim() : '';
                    if (!raw) return false;
                    if (normalizedHost) {
                        const existingHost = extractHostname(raw);
                        if (existingHost && existingHost.toLowerCase() === normalizedHost) {
                            return true;
                        }
                    }
                    return raw.toLowerCase() === valueToSaveLower;
                });
            }
        } catch (cacheErr) {
            console.warn('Gagal memeriksa whitelist lokal:', cacheErr);
        }

        if (alreadyExists) {
            resetClasses();
            button.dataset.pending = 'done';
            button.classList.add('is-info');
            setStatus('info', 'Sudah ada');
            return;
        }

        await apiAddWhitelistByKeyword(currentKeywordId, [valueToSave]);
        try {
            const store = await chrome.storage.local.get('whitelistCache');
            const cache = store.whitelistCache || {};
            delete cache[String(currentKeywordId)];
            await chrome.storage.local.set({ whitelistCache: cache });
        } catch (invalidateErr) {
            console.warn('Gagal menghapus cache whitelist:', invalidateErr);
        }
        resetClasses();
        button.dataset.pending = 'done';
        button.classList.add('is-success');
        setStatus('success', 'Ditambahkan');
    } catch (err) {
        console.error('Gagal menambahkan ke whitelist:', err);
        resetClasses();
        button.classList.add('is-error');
        button.disabled = false;
        delete button.dataset.pending;
        setStatus('error', 'Gagal, coba lagi');
    }
}


async function viewWhitelist() {
    const user = auth.currentUser;
    if (!user) return;
    resultsDiv.innerHTML = 'Mengambil whitelist dari server...';
    copyContainer.classList.add('hidden');
    resetButton.classList.add('hidden');
    filterContainer.classList.add('hidden');
    searchQueryDisplay.classList.add('hidden');
    const keywords = await apiListKeywords();

    let htmlResult = `
        <div class="whitelist-manager-container">
            <div class="bulk-add-section">
                <h4>Tambah Link Massal (Bulk)</h4>
                <textarea id="bulkWhitelistInput" placeholder="Tempel daftar link di sini, satu link per baris..."></textarea>
                <div class="bulk-add-controls">
                    <input type="text" id="bulkQueryInput" placeholder="Nama Kueri untuk Kategori">
                    <button id="bulkAddButton">Tambahkan</button>
                </div>
            </div>
            <input type="text" id="whitelistSearchInput" placeholder="Cari di dalam whitelist...">
            <div class="accordion-container"></div>
        </div>
    `;
    resultsDiv.innerHTML = htmlResult;

    const accordionContainer = resultsDiv.querySelector('.accordion-container');
    const queryCategories = Object.keys(categories).sort();
    if (queryCategories.length === 0) {
        accordionContainer.innerHTML = '<p>Daftar whitelist Anda masih kosong.</p>';
    } else {
        queryCategories.forEach(queryName => {
            if (Array.isArray(categories[queryName]) && categories[queryName].length > 0) {
                const accordionItem = document.createElement('div');
                accordionItem.className = 'accordion-item';
                const header = document.createElement('button');
                header.className = 'accordion-header';
                header.textContent = `Kueri: "${queryName}" (${categories[queryName].length} link)`;
                const content = document.createElement('div');
                content.className = 'accordion-content';
                categories[queryName].sort().forEach(url => {
                    content.innerHTML += `<div class="whitelist-item"><span>${url}</span><button class="remove-whitelist-button" data-url="${url}" data-category="${queryName}" title="Hapus">🗑️</button></div>`;
                });
                accordionItem.appendChild(header);
                accordionItem.appendChild(content);
                accordionContainer.appendChild(accordionItem);
            }
        });
    }

    document.getElementById('bulkAddButton').addEventListener('click', bulkAddToWhitelist);
    document.getElementById('whitelistSearchInput').addEventListener('input', filterWhitelist);
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('active');
            const content = header.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    });
    document.querySelectorAll('.remove-whitelist-button').forEach(btn => {
        btn.addEventListener('click', async (event) => {
            const urlToRemove = event.target.dataset.url;
            const category = event.target.dataset.category;
            await removeFromWhitelist(urlToRemove, category);
            viewWhitelist(); 
        });
    });
}

async function bulkAddToWhitelist() {
    const user = auth.currentUser;
    if (!user) return;
    const urlsText = document.getElementById('bulkWhitelistInput').value;
    const queryAsCategory = document.getElementById('bulkQueryInput').value.trim();
    if (!urlsText || !queryAsCategory) {
        alert("Harap isi daftar link dan nama kueri.");
        return;
    }
    const urlsToAdd = urlsText.split('\n').map(u => u.trim()).filter(u => u);
    if (urlsToAdd.length === 0) return;
    const up = await apiUpsertKeyword(queryAsCategory);
    await apiAddWhitelistByKeyword(up.id, urlsToAdd);
    renderWhitelistManager();
}

async function removeFromWhitelist(url, category) {
    const user = auth.currentUser;
    if (!user) return;
    const up = await apiUpsertKeyword(category);
    await apiRemoveWhitelistByKeyword(up.id, url);
}
viewWhitelistButton.addEventListener('click', renderWhitelistManager);

function copyReport() {
    chrome.storage.local.get('scrapeData', ({ scrapeData }) => {
        if (!scrapeData || scrapeData.links.length === 0) return;

        const reportEntries = scrapeData.links.map(link => {
            return [
                `Pelaku Phising : ${link.title || 'Tidak ditemukan'}`,
                `Korban Phising : ${scrapeData.query}`,
                `Main Link : ${link.mainLink}`,
                `Link AMP : ${link.ampLink || 'Tidak ditemukan'}`,
                `Link Button : `,
                `Shortlink : `,
                `Link Tujuan : `
            ].join('\n');
        });

        const finalReportString = reportEntries.join('\n---------------------\n');

        navigator.clipboard.writeText(finalReportString).then(() => {
            copyReportButton.textContent = 'Tersalin!';
            setTimeout(() => { copyReportButton.textContent = 'Copy untuk Laporan'; }, 2000);
        });
    });
}

function copyLinksOnly() {
    chrome.storage.local.get('scrapeData', ({ scrapeData }) => {
        if (!scrapeData || scrapeData.links.length === 0) return;
        const allLinksArray = [];
        scrapeData.links.forEach(links => {
            if (links.mainLink) { allLinksArray.push(links.mainLink); }
            if (links.ampLink) { allLinksArray.push(links.ampLink); }
        });
        const linksOnlyString = allLinksArray.join('\n');
        navigator.clipboard.writeText(linksOnlyString).then(() => {
            copyLinksButton.textContent = 'Tersalin!';
            setTimeout(() => { copyLinksButton.textContent = 'Copy Link Saja'; }, 2000);
        });
    });
}
copyReportButton.addEventListener('click', copyReport);
copyLinksButton.addEventListener('click', copyLinksOnly);

function filterResults() {
    if (!fullScrapedData) return;
    const searchTerm = filterInput.value.toLowerCase();
    if (!searchTerm) {
        renderUI(fullScrapedData);
        return;
    }
    const filteredLinks = fullScrapedData.links.filter(linkItem => {
        const titleMatch = linkItem.title && linkItem.title.toLowerCase().includes(searchTerm);
        const mainLinkMatch = linkItem.mainLink.toLowerCase().includes(searchTerm);
        const ampLinkMatch = linkItem.ampLink && linkItem.ampLink.toLowerCase().includes(searchTerm);
        return titleMatch || mainLinkMatch || ampLinkMatch;
    });
    const filteredData = {
        query: fullScrapedData.query,
        links: filteredLinks
    };
    renderUI(filteredData);
}
filterInput.addEventListener('input', filterResults);

async function filterWhitelist(event) {
    const inputEl = document.getElementById('whitelistSearchInput');
    const searchTerm = (event && event.target ? event.target.value : (inputEl ? inputEl.value : ''))
        .trim().toLowerCase();
    const allItems = document.querySelectorAll('.accordion-item');

    for (const item of allItems) {
        const header = item.querySelector('.accordion-header');
        const content = item.querySelector('.accordion-content');

        // Jika sedang mencari dan konten belum dimuat, lazy-load dulu agar bisa ikut tersaring
        if (searchTerm && content && content.dataset.loaded !== 'true') {
            try {
                const kid = parseInt(header.dataset.keywordId, 10);
                const items = await getWhitelistWithCache(kid);
                const html = (Array.isArray(items) ? items : [])
                    .map(row => {
                        const val = (row && (row.url || row.domain)) ? (row.url || row.domain) : '';
                        if (!val) return '';
                        return `<div class="whitelist-item"><span>${val}</span><button class="remove-whitelist-button" data-url="${val}" data-keyword-id="${kid}" title="Hapus">Hapus</button></div>`;
                    })
                    .join('');
                content.innerHTML = html;
                content.dataset.loaded = 'true';
                try { await filterWhitelist(); } catch {}
            } catch {}
        }

        const rows = Array.from(content.querySelectorAll('.whitelist-item'));

        if (!searchTerm) {
            item.style.display = '';
            rows.forEach(row => { row.style.display = ''; });
            if (header.dataset.searchToggled === 'true') {
                header.classList.remove('active');
                delete header.dataset.searchToggled;
            }
            if (header.classList.contains('active')) {
                content.style.maxHeight = content.scrollHeight + 'px';
            } else {
                content.style.maxHeight = null;
            }
            continue;
        }

        const categoryMatch = header.textContent.toLowerCase().includes(searchTerm);
        let matchedLinks = 0;

        rows.forEach(row => {
            const linkText = row.querySelector('span').textContent.toLowerCase();
            const isMatch = linkText.includes(searchTerm);
            row.style.display = isMatch ? '' : 'none';
            if (isMatch) { matchedLinks += 1; }
        });

        if (matchedLinks > 0) {
            item.style.display = '';
            if (!header.classList.contains('active')) {
                header.classList.add('active');
                header.dataset.searchToggled = 'true';
            }
            content.style.maxHeight = content.scrollHeight + 'px';
        } else if (categoryMatch) {
            item.style.display = '';
            rows.forEach(row => { row.style.display = ''; });
            if (!header.classList.contains('active')) {
                header.classList.add('active');
                header.dataset.searchToggled = 'true';
            }
            content.style.maxHeight = content.scrollHeight + 'px';
        } else {
            item.style.display = 'none';
        }
    }
}

// Inisialisasi Tampilan Awal
// Jangan paksa state logout di awal; biarkan overlay tampil
// sampai auth.onAuthStateChanged memutuskan state sebenarnya.

// Tampilan whitelist berbasis keywords (sesuai skema MySQL)
async function renderWhitelistManager() {
    const user = auth.currentUser;
    if (!user) return;
    resultsDiv.innerHTML = 'Mengambil whitelist dari server...';
    copyContainer.classList.add('hidden');
    resetButton.classList.add('hidden');
    filterContainer.classList.add('hidden');
    searchQueryDisplay.classList.add('hidden');
    const prevSearch = (document.getElementById('whitelistSearchInput')?.value || '').trim();

    const keywords = await apiListKeywords();

    let htmlResult = `
        <div class="whitelist-manager-container">
            <div class="bulk-add-section">
                <h4>Tambah Link Massal (Bulk)</h4>
                <textarea id="bulkWhitelistInput" placeholder="Tempel daftar link di sini, satu link per baris..."></textarea>
                <div class="bulk-add-controls">
                    <input type="text" id="bulkQueryInput" placeholder="Nama Kueri untuk Kategori">
                    <button id="bulkAddButton">Tambahkan</button>
                </div>
            </div>
            <input type="text" id="whitelistSearchInput" placeholder="Cari di dalam whitelist...">
            <div class="accordion-container"></div>
        </div>
    `;
    resultsDiv.innerHTML = htmlResult;
    if (prevSearch) {
        const inp = document.getElementById('whitelistSearchInput');
        if (inp) inp.value = prevSearch;
    }

    const accordionContainer = resultsDiv.querySelector('.accordion-container');
    if (!Array.isArray(keywords) || keywords.length === 0) {
        accordionContainer.innerHTML = '<p>Daftar whitelist Anda masih kosong.</p>';
    } else {
        const frag = document.createDocumentFragment();
        for (const kw of keywords) {
            const accordionItem = document.createElement('div');
            accordionItem.className = 'accordion-item';

            const header = document.createElement('button');
            header.className = 'accordion-header';
            header.textContent = `Kueri: "${kw.keyword}" (${kw.count || 0} link)`;
            header.dataset.keywordId = kw.id;

            const content = document.createElement('div');
            content.className = 'accordion-content';
            content.dataset.loaded = 'false';

            accordionItem.appendChild(header);
            accordionItem.appendChild(content);
            frag.appendChild(accordionItem);
        }
        accordionContainer.appendChild(frag);
    }

    document.getElementById('bulkAddButton').addEventListener('click', async () => {
        const urlsText = document.getElementById('bulkWhitelistInput').value;
        const queryAsCategory = document.getElementById('bulkQueryInput').value.trim();
        if (!urlsText || !queryAsCategory) { alert('Harap isi daftar link dan nama kueri.'); return; }
        const urlsToAdd = urlsText
            .split('\n')
            .map(u => u.trim())
            .filter(Boolean)
            .map(u => {
                const norm = normalizeUrl(u) || u;
                const host = extractHostname(norm) || norm;
                return host.toLowerCase();
            });
        const up = await apiUpsertKeyword(queryAsCategory);
        await apiAddWhitelistByKeyword(up.id, urlsToAdd);
        try {
            const store = await chrome.storage.local.get('whitelistCache');
            const cache = store.whitelistCache || {};
            delete cache[String(up.id)];
            await chrome.storage.local.set({ whitelistCache: cache });
        } catch {}
        renderWhitelistManager();
    });
    document.getElementById('whitelistSearchInput').addEventListener('input', filterWhitelist);
    if (prevSearch) { try { await filterWhitelist(); } catch {} }

    // Delegasi: expand + lazy load
    accordionContainer.addEventListener('click', async (evt) => {
        const header = evt.target.closest('.accordion-header');
        if (!header) return;
        header.classList.toggle('active');
        const content = header.nextElementSibling;
        if (content.style.maxHeight) {
            content.style.maxHeight = null;
        } else {
            if (content.dataset.loaded !== 'true') {
                const kid = parseInt(header.dataset.keywordId, 10);
                const items = await getWhitelistWithCache(kid);
                const html = (Array.isArray(items) ? items : [])
                    .map(row => {
                        const val = (row && (row.url || row.domain)) ? (row.url || row.domain) : '';
                        if (!val) return '';
                        return `<div class="whitelist-item"><span>${val}</span><button class="remove-whitelist-button" data-url="${val}" data-keyword-id="${kid}" title="Hapus">Hapus</button></div>`;
                    })
                    .join('');
                content.innerHTML = html;
                content.dataset.loaded = 'true';
            }
            content.style.maxHeight = content.scrollHeight + 'px';
        }
    });

    // Delegasi: hapus item
    accordionContainer.addEventListener('click', async (evt) => {
        const btn = evt.target.closest('.remove-whitelist-button');
        if (!btn) return;
        const urlToRemove = btn.dataset.url;
        const keywordId = parseInt(btn.dataset.keywordId, 10);
        await apiRemoveWhitelistByKeyword(keywordId, urlToRemove);
        // Invalidasi cache untuk keyword ini
        const store = await chrome.storage.local.get('whitelistCache');
        const cache = store.whitelistCache || {};
        delete cache[String(keywordId)];
        await chrome.storage.local.set({ whitelistCache: cache });
        renderWhitelistManager();
    });
}