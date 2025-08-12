// background.js (v0.3.1)
const MENU_ID = 'glow_add';

// i18n helpers
function getUILang() { try { return (chrome.i18n.getUILanguage?.() || navigator.language || 'en').toLowerCase(); } catch { return 'en'; } }
function isZH() { return getUILang().startsWith('zh'); }
function menuTitle() { return isZH() ? '加入 Glow Dictionary 词典' : 'Add to Glow Dictionary'; }
function cannotInjectMsg() { return isZH() ? '无法在此页面打开加词面板（该页面不支持扩展注入）。' : 'Cannot open add panel on this page (extensions cannot run here).'; }

const FLAGS_KEY = 'gdFlags';

// Right-click visibility helpers
async function canInjectInto(url) {
    if (!url) return false;
    if (/^https?:\/\//i.test(url)) return true;
    if (/^file:\/\//i.test(url)) return new Promise(r => chrome.extension.isAllowedFileSchemeAccess(r));
    return false;
}
async function setMenuVisible(visible, title, pats = ['http://*/*', 'https://*/*', 'file://*/*']) {
    try { await chrome.contextMenus.update(MENU_ID, { visible, title }); }
    catch {
        try { await chrome.contextMenus.remove(MENU_ID); } catch { }
        if (visible) chrome.contextMenus.create({ id: MENU_ID, title, contexts: ['selection'], documentUrlPatterns: pats });
    }
}
async function refreshMenuForActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await setMenuVisible(!!(await canInjectInto(tab?.url || '')), menuTitle());
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    // 新默认结构：支持同时勾选 v0.2 / v0.3
    if (reason === 'install' || reason === 'upgrade' || reason === 'update') {
        chrome.storage.local.get(FLAGS_KEY, ({ gdFlags }) => {
            const defaults = {
                enabled: true,
                useWords: true, usePhrases: false, useSentences: false,
                usePackV02: true, usePackV03: false // 默认启用 v0.2，兼容老版本
            };
            // 迁移老字段 packVersion
            if (gdFlags && typeof gdFlags === 'object') {
                const next = Object.assign({}, defaults, gdFlags);
                if (gdFlags.packVersion) {
                    next.usePackV02 = gdFlags.packVersion === 'v0.2';
                    next.usePackV03 = gdFlags.packVersion === 'v0.3';
                }
                chrome.storage.local.set({ [FLAGS_KEY]: next });
            } else {
                chrome.storage.local.set({ [FLAGS_KEY]: defaults });
            }
        });
    }
    await setMenuVisible(false, menuTitle());
    await refreshMenuForActiveTab();
});

chrome.tabs.onActivated.addListener(refreshMenuForActiveTab);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'loading' || info.url) refreshMenuForActiveTab(); });

// toast fallback
async function notifyFailure(tabId, msg) {
    try { await chrome.tabs.sendMessage(tabId, { type: 'glow.toast', text: msg }); return; } catch { }
    try {
        await chrome.action.setBadgeBackgroundColor({ color: '#E02424' });
        await chrome.action.setBadgeText({ text: '!' });
        await chrome.action.setTitle({ title: msg });
        setTimeout(async () => { await chrome.action.setBadgeText({ text: '' }); await chrome.action.setTitle({ title: '' }); }, 3000);
    } catch { }
    try {
        await chrome.notifications.create({
            type: 'basic', iconUrl: 'data:image/svg+xml;charset=utf-8;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48c3ZnIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDQ4IDQ4IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik00NCA4SDRWMzhIMTlMMjQgNDNMMjkgMzhINDRWOFoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzMzMyIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNMjQgMjNWMzIiIHN0cm9rZT0iIzMzMyIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNMjQgMTZWMTciIHN0cm9rZT0iIzMzMyIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=',
            title: 'Glow Dictionary', message: msg, priority: 1
        });
        setTimeout(() => chrome.notifications.getAll(ids => Object.keys(ids || {}).forEach(id => chrome.notifications.clear(id))), 3000);
    } catch { }
}

// 右键添加
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab?.id) return;
    const term = (info.selectionText || '').trim();
    if (!term) return;
    const payload = { type: 'glow.openAdd', term };
    try { await chrome.tabs.sendMessage(tab.id, payload); return; } catch { }
    try {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id, allFrames: true }, files: ['content.css'] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] });
        await chrome.tabs.sendMessage(tab.id, payload);
    } catch { await notifyFailure(tab.id, cannotInjectMsg()); }
});
