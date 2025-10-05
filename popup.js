// ===================================================================
// PASTE KONFIGURASI FIREBASE ANDA DI SINI
// ===================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBDHk3eB7X1XekK6zdEGZbdNxCG8N3ht_U",
    authDomain: "phising-checker.firebaseapp.com",
    projectId: "phising-checker",
    storageBucket: "phising-checker.firebasestorage.app",
    messagingSenderId: "927232129051",
    appId: "1:927232129051:web:7e50c08624625b2beaa0be",
};

// ===================================================================
// PASTE KONFIGURASI SUPABASE ANDA DI SINI
// ===================================================================
const SUPABASE_URL = 'https://tuzgfymuoopfyfdusoge.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1emdmeW11b29wZnlmZHVzb2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3NDQ4MDMsImV4cCI6MjA3MzMyMDgwM30.nzg9KJN0OKrr2bqPGc1GQ39UzXpRryopxBS9kDSQ0gM';

// --- Inisialisasi Firebase ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

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

// ========================================================
// FUNGSI HELPER
// ========================================================
function normalizeUrl(urlString) {
    if (!urlString) return null;
    try {
        const url = new URL(urlString);
        if (url.hostname.startsWith('www.')) {
            url.hostname = url.hostname.substring(4);
        }
        return url.protocol + '//' + url.hostname + url.pathname + url.search + url.hash;
    } catch (e) {
        return urlString;
    }
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
                        <span>${linkItem.mainLink}</span>
                        <button class="action-icon whitelist-button" data-url="${linkItem.mainLink}" title="Tambahkan ke Whitelist">➕</button>
                        <button class="action-icon visit-link-button" data-url="${linkItem.mainLink}" title="Kunjungi Main Link">🚀</button>
                    </div>
                </div>`;
        
        // Bagian AMP Link (hanya jika ada)
        if (linkItem.ampLink) {
            htmlResult += `
                <div>
                    <strong style="display: block; font-size: 0.8em; color: #5f6368;">AMP LINK:</strong>
                    <div class="link-row">
                        <span>${linkItem.ampLink}</span>
                        <button class="action-icon whitelist-button" data-url="${linkItem.ampLink}" title="Tambahkan ke Whitelist">➕</button>
                        <button class="action-icon visit-link-button" data-url="${linkItem.ampLink}" title="Kunjungi AMP Link">⚡</button>
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
function scrapeDataOnPage() {
    const queryInput = document.querySelector('textarea[name="q"]');
    const query = queryInput ? queryInput.value : '';
    const resultBlocks = document.querySelectorAll('.MjjYud');
    const scrapedData = [];
    for (const block of resultBlocks) {
        const linkElement = block.querySelector('h3 a') || block.querySelector('.yuRUbf a') || block.querySelector('a');
        const titleElement = block.querySelector('h3, div[role="heading"][aria-level="3"]'); 

        if (linkElement) {
            const title = titleElement ? titleElement.innerText.trim() : 'Judul tidak ditemukan';
            scrapedData.push({ 
                title: title,
                mainLink: linkElement.href, 
                ampLink: linkElement.getAttribute('data-amp') 
            });
        }
    }
    return { query, links: scrapedData };
}

async function getLinksAndFilter() {
    resultsDiv.innerHTML = 'Mengambil whitelist dari server...';
    const user = auth.currentUser;
    if (!user) { alert("Anda harus login terlebih dahulu."); return; }

    const docRef = db.collection("whitelists").doc(user.uid);
    const docSnap = await docRef.get();
    let flatWhitelist = [];
    if (docSnap.exists) {
        const categories = docSnap.data();
        Object.values(categories).forEach(urlArray => {
            if(Array.isArray(urlArray)) flatWhitelist.push(...urlArray);
        });
    }
    
    const whitelistedDomains = flatWhitelist.map(url => {
        try {
            let hostname = new URL(url).hostname;
            if (hostname.startsWith('www.')) {
                hostname = hostname.substring(4);
            }
            return hostname;
        } catch (e) {
            return null;
        }
    }).filter(Boolean);

    resultsDiv.innerHTML = 'Mengambil link dari halaman SERP...';
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
        scrapeResult.links = scrapeResult.links.filter(linkItem => {
            try {
                let mainLinkHostname = new URL(linkItem.mainLink).hostname;
                if (mainLinkHostname.startsWith('www.')) {
                    mainLinkHostname = mainLinkHostname.substring(4);
                }
                const isWhitelisted = whitelistedDomains.some(whitelistedDomain => mainLinkHostname.includes(whitelistedDomain));
                return !isWhitelisted;
            } catch (e) {
                return true;
            }
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
    setTimeout(() => {
        if (user) {
            showLoggedInState(user);
        } else {
            showLoggedOutState();
        }
        loadingOverlay.classList.add('hidden');
        container.style.visibility = 'visible';
    }, 2000);
});

loginButton.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        alert("Mohon isi email dan password.");
        return;
    }

    container.style.visibility = 'hidden';
    loadingMessage.textContent = "Menyambungkan...";
    loadingOverlay.classList.remove('hidden');

    auth.signInWithEmailAndPassword(email, password)
        .catch((error) => {
            loadingOverlay.classList.add('hidden');
            container.style.visibility = 'visible';
            alert("Login Gagal: " + error.message);
        });
});

logoutButton.addEventListener('click', () => {
    container.style.visibility = 'hidden';
    loadingMessage.textContent = "Memutuskan koneksi...";
    loadingOverlay.classList.remove('hidden');

    auth.signOut().then(() => {
        chrome.storage.local.remove('scrapeData');
        fullScrapedData = null;
        filterInput.value = '';
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
    const urlToWhitelist = event.target.dataset.url;
    if (!urlToWhitelist) return;
    const { scrapeData } = await chrome.storage.local.get('scrapeData');
    const queryAsCategory = scrapeData ? scrapeData.query.trim() : "Umum";
    const docRef = db.collection("whitelists").doc(user.uid);
    const updateData = {};
    updateData[queryAsCategory] = firebase.firestore.FieldValue.arrayUnion(urlToWhitelist);
    await docRef.set(updateData, { merge: true });
    event.target.textContent = '✅';
    event.target.disabled = true;
}

async function viewWhitelist() {
    const user = auth.currentUser;
    if (!user) return;
    resultsDiv.innerHTML = 'Mengambil whitelist dari server...';
    copyContainer.classList.add('hidden');
    resetButton.classList.add('hidden');
    filterContainer.classList.add('hidden');
    searchQueryDisplay.classList.add('hidden');
    const docRef = db.collection("whitelists").doc(user.uid);
    let docSnap = await docRef.get();
    
    if (docSnap.exists && Array.isArray(docSnap.data().urls)) {
        const oldUrls = docSnap.data().urls;
        await docRef.set({ "Umum": oldUrls });
        docSnap = await docRef.get();
    }
    
    const categories = docSnap.exists ? docSnap.data() : {};

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
    const docRef = db.collection("whitelists").doc(user.uid);
    const updateData = {};
    updateData[queryAsCategory] = firebase.firestore.FieldValue.arrayUnion(...urlsToAdd);
    await docRef.set(updateData, { merge: true });
    viewWhitelist();
}

async function removeFromWhitelist(url, category) {
    const user = auth.currentUser;
    if (!user) return;
    const docRef = db.collection("whitelists").doc(user.uid);
    const updateData = {};
    updateData[category] = firebase.firestore.FieldValue.arrayRemove(url);
    await docRef.update(updateData);
}
viewWhitelistButton.addEventListener('click', viewWhitelist);

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

function filterWhitelist(event) {
    const searchTerm = event.target.value.toLowerCase();
    const allItems = document.querySelectorAll('.accordion-item');
    allItems.forEach(item => {
        const headerText = item.querySelector('.accordion-header').textContent.toLowerCase();
        const links = Array.from(item.querySelectorAll('.whitelist-item span')).map(span => span.textContent.toLowerCase());
        const hasMatch = headerText.includes(searchTerm) || links.some(link => link.includes(searchTerm));
        item.style.display = hasMatch ? '' : 'none';
    });
}

// Inisialisasi Tampilan Awal
showLoggedOutState();