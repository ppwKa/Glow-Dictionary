// options.js (v0.3.1)
const FLAGS_KEY = 'gdFlags';       // {enabled, useWords, usePhrases, useSentences, usePackV02, usePackV03}
const CUSTOM_KEY = 'gdCustomDict'; // 自定义词库

const $ = (s) => document.querySelector(s);
const input = $('#jsonInput');
const chkW = $('#w'), chkP = $('#p'), chkS = $('#s'), chkEn = $('#enbl');
const packV02 = $('#packV02'), packV03 = $('#packV03');

const defaults = { enabled: true, useWords: true, usePhrases: false, useSentences: false, usePackV02: true, usePackV03: false };

// 加载开关
function loadFlags() {
    chrome.storage.local.get(FLAGS_KEY, (res) => {
        const f = Object.assign({}, defaults, res[FLAGS_KEY] || {});
        packV02.checked = !!f.usePackV02;
        packV03.checked = !!f.usePackV03;
        chkW.checked = !!f.useWords;
        chkP.checked = !!f.usePhrases;
        chkS.checked = !!f.useSentences;
        chkEn.checked = !!f.enabled;
    });
}
function saveFlags(partial) {
    chrome.storage.local.get(FLAGS_KEY, (res) => {
        const old = Object.assign({}, defaults, res[FLAGS_KEY] || {});
        const next = Object.assign({}, old, partial);
        chrome.storage.local.set({ [FLAGS_KEY]: next });
    });
}
packV02.addEventListener('change', e => saveFlags({ usePackV02: e.target.checked }));
packV03.addEventListener('change', e => saveFlags({ usePackV03: e.target.checked }));
chkW.addEventListener('change', e => saveFlags({ useWords: e.target.checked }));
chkP.addEventListener('change', e => saveFlags({ usePhrases: e.target.checked }));
chkS.addEventListener('change', e => saveFlags({ useSentences: e.target.checked }));
chkEn.addEventListener('change', e => saveFlags({ enabled: e.target.checked }));

// 自定义词库
function loadCustom() {
    chrome.storage.local.get(CUSTOM_KEY, (res) => {
        const dict = res[CUSTOM_KEY] || {};
        input.value = JSON.stringify(dict, null, 2);
    });
}
function saveCustom() {
    try {
        const obj = JSON.parse(input.value || '{}');
        if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error('需为对象');
        const normalized = {};
        for (const k of Object.keys(obj)) normalized[String(k).toLowerCase()] = obj[k];
        chrome.storage.local.set({ [CUSTOM_KEY]: normalized }, () => alert('已保存 ✅'));
    } catch (e) { alert('JSON 格式错误：' + e.message); }
}
$('#save').addEventListener('click', saveCustom);
$('#format').addEventListener('click', () => {
    try { input.value = JSON.stringify(JSON.parse(input.value || '{}'), null, 2); }
    catch { alert('当前文本不是有效 JSON'); }
});
$('#file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    try { input.value = JSON.stringify(JSON.parse(text), null, 2); }
    catch { alert('上传文件不是有效 JSON'); }
});
$('#export').addEventListener('click', () => {
    const blob = new Blob([input.value || '{}'], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'glow-custom-dictionary.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
});
$('#clear').addEventListener('click', () => {
    if (!confirm('确定要清空自定义词库吗？')) return;
    chrome.storage.local.remove(CUSTOM_KEY, () => { input.value = '{}'; alert('已清空'); });
});

// 示例 JSON 预览
const samplePack = $('#samplePack');
const sampleKind = $('#sampleKind');
const sampleView = $('#sampleView');
$('#loadSample').addEventListener('click', async () => {
    try {
        const url = chrome.runtime.getURL(`assets/dicts/${samplePack.value}/${sampleKind.value}.json`);
        const res = await fetch(url);
        if (!res.ok) throw new Error('无法加载：' + url);
        const json = await res.json();
        // 只展示前若干项，避免太大
        const keys = Object.keys(json);
        const firstKeys = keys.slice(0, 50);
        const preview = {};
        for (const k of firstKeys) preview[k] = json[k];
        const more = keys.length > firstKeys.length ? `\n...\n共 ${keys.length} 条（仅预览前 50 条）` : '';
        sampleView.textContent = JSON.stringify(preview, null, 2) + more;
    } catch (e) {
        sampleView.textContent = '加载失败：' + e.message;
    }
});
$('#copySample').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(sampleView.textContent || '');
        alert('已复制到剪贴板 ✅');
    } catch {
        alert('复制失败，请手动选择文本复制。');
    }
});

// init
loadFlags();
loadCustom();
