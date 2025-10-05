function addClickListenersToLinks() {
    const allHeadings = document.querySelectorAll('h3, div[role="heading"][aria-level="3"]');
    allHeadings.forEach(heading => {
        const link = heading.closest('a');
        if (link && link.href && link.hasAttribute('data-ved') && !link.dataset.serpCopierListener) {
            link.addEventListener('mousedown', (event) => {
                if (event.button !== 0) return;
                const linkTitle = heading.textContent.trim();
                const clickedUrl = link.href;
                let ampUrl = null;
                if (link.dataset.amp) {
                    ampUrl = link.dataset.amp;
                } else {
                    const nestedAmpElement = link.querySelector('[data-amp]');
                    if (nestedAmpElement) {
                        ampUrl = nestedAmpElement.dataset.amp;
                    }
                }
                chrome.runtime.sendMessage({
                    type: 'SAVE_LINK',
                    linkData: {
                        title: linkTitle,
                        clicked: clickedUrl,
                        amp: ampUrl || 'N/A'
                    }
                }, (response) => {
                    if (response && response.wasSaved) {
                        const urlForClipboard = ampUrl || clickedUrl;
                        navigator.clipboard.writeText(urlForClipboard);
                    }
                });
            });
            link.dataset.serpCopierListener = 'true';
        }
    });
}

const urlParams = new URLSearchParams(window.location.search);
const query = urlParams.get('q');
if (query) {
    chrome.storage.local.set({ lastQuery: query });
}

addClickListenersToLinks();

const observer = new MutationObserver(() => {
    addClickListenersToLinks();
});
observer.observe(document.body, {
    childList: true,
    subtree: true
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CLEAR_DATA') {
        const processedLinks = document.querySelectorAll('[data-serp-copier-listener="true"]');
        processedLinks.forEach(link => {
            link.removeAttribute('data-serp-copier-listener');
        });
        console.log('SERP Copier listeners have been reset.');
    }
});