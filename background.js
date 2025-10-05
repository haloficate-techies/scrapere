let tabsToTrack = {};

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
        chrome.storage.local.get({ copiedLinks: [] }, (data) => {
            const isTrackedUrl = data.copiedLinks.some(link => link.finalUrl === details.url);
            if (isTrackedUrl) {
                console.log('Tracking redirect for tab:', details.tabId, 'and URL:', details.url);
                tabsToTrack[details.tabId] = details.url;
            }
        });
    }
});

chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) {
        if (details.tabId in tabsToTrack) {
            const originalUrl = tabsToTrack[details.tabId];
            const redirectedUrl = details.url;

            if (originalUrl !== redirectedUrl) {
                console.log('Redirect DETECTED! Original:', originalUrl, 'New:', redirectedUrl);
                
                chrome.storage.local.get({ copiedLinks: [] }, (data) => {
                    const links = data.copiedLinks;
                    const linkToUpdate = links.find(link => link.finalUrl === originalUrl);

                    if (linkToUpdate) {
                        linkToUpdate.redirectedUrl = redirectedUrl;
                        chrome.storage.local.set({ copiedLinks: links });
                    }
                });
            }
            delete tabsToTrack[details.tabId];
        }
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "saveFinalUrl",
        title: "SERP Copier: Save Final URL",
        contexts: ["link"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "saveFinalUrl") {
        const finalUrl = info.linkUrl;
        chrome.storage.local.get({ copiedLinks: [] }, (data) => {
            const links = data.copiedLinks;
            if (links.length > 0) {
                const mostRecentLink = links[0];
                mostRecentLink.finalUrl = finalUrl;
                chrome.storage.local.set({ copiedLinks: links });
            }
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SAVE_LINK') {
        chrome.storage.local.get({ copiedLinks: [] }, (data) => {
            const links = data.copiedLinks;
            const isDuplicate = links.some(existingLink => existingLink.clicked === message.linkData.clicked);
            if (!isDuplicate) {
                links.unshift(message.linkData);
                chrome.storage.local.set({ copiedLinks: links }, () => {
                    sendResponse({ wasSaved: true });
                });
            } else {
                sendResponse({ wasSaved: false });
            }
        });
        return true;
    }
});