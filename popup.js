// popup.js (v0.3.1)
const FLAGS_KEY = 'gdFlags';

function getUILang() { try { return (chrome.i18n.getUILanguage?.() || navigator.language || 'en').toLowerCase(); } catch { return 'en'; } }
const ZH = getUILang().startsWith('zh');

if (!ZH) {
    document.getElementById('t_enable').textContent = 'Enable Highlighting';
    document.getElementById('t_packs').textContent = 'Dictionary Packs (multi-select)';
    document.getElementById('t_words').textContent = 'Enable default "Words"';
    document.getElementById('t_phrases').textContent = 'Enable default "Phrases"';
    document.getElementById('t_sentences').textContent = 'Enable default "Sentences"';
    document.getElementById('openOptions').textContent = 'Open Options';
}
document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version;

const defaults = {
    enabled: true,
    useWords: true, usePhrases: false, useSentences: false,
    usePackV02: true, usePackV03: false
};

function loadFlags() {
    chrome.storage.local.get(FLAGS_KEY, (res) => {
        const f = Object.assign({}, defaults, res[FLAGS_KEY] || {});
        document.getElementById('chkEnable').checked = !!f.enabled;
        document.getElementById('packV02').checked = !!f.usePackV02;
        document.getElementById('packV03').checked = !!f.usePackV03;
        document.getElementById('chkWords').checked = !!f.useWords;
        document.getElementById('chkPhrases').checked = !!f.usePhrases;
        document.getElementById('chkSentences').checked = !!f.useSentences;
    });
}
function saveFlags(partial) {
    chrome.storage.local.get(FLAGS_KEY, (res) => {
        const old = Object.assign({}, defaults, res[FLAGS_KEY] || {});
        const next = Object.assign({}, old, partial);
        chrome.storage.local.set({ [FLAGS_KEY]: next });
    });
}

document.getElementById('chkEnable').addEventListener('change', e => saveFlags({ enabled: e.target.checked }));
document.getElementById('packV02').addEventListener('change', e => saveFlags({ usePackV02: e.target.checked }));
document.getElementById('packV03').addEventListener('change', e => saveFlags({ usePackV03: e.target.checked }));
document.getElementById('chkWords').addEventListener('change', e => saveFlags({ useWords: e.target.checked }));
document.getElementById('chkPhrases').addEventListener('change', e => saveFlags({ usePhrases: e.target.checked }));
document.getElementById('chkSentences').addEventListener('change', e => saveFlags({ useSentences: e.target.checked }));
document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

loadFlags();
