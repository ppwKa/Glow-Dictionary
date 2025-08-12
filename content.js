// content.js (v0.3.1)
// 变更：1) Panel 支持关闭 icon + 点击页面其他地方关闭；2) 高亮控制改为单选；
//      3) Card 贴近锚点（≈4px），无动画；4) 仍保持可视区懒加载高亮与可视区内去重。

(() => {
    const HIGHLIGHT_CLASS = 'glow-highlight';
    const ROOT_ID = 'glow-root';

    // storage keys
    const FLAGS_KEY = 'gdFlags';
    const CUSTOM_KEY = 'gdCustomDict';
    const MUTE_GLOBAL_KEY = 'gdMuteGlobal';
    const MUTE_BY_DOMAIN_KEY = 'gdMuteByDomain';
    const DISABLE_BY_PAGE_KEY = 'gdDisableByPage';
    const DISABLE_BY_DOMAIN_ALL_KEY = 'gdDisableDomainAll';

    // 本次访问临时关闭（不持久化；刷新/下次进入恢复）
    let DISABLE_THIS_VISIT = false;

    // i18n
    function getUILang() { try { return (chrome.i18n.getUILanguage?.() || navigator.language || 'en').toLowerCase(); } catch { return 'en'; } }
    const LANG_ZH = getUILang().startsWith('zh');
    const I18N = LANG_ZH ? {
        panelTitle: '加入 Glow Dictionary 词典',
        term: '术语', translation: '翻译', pos: '词性', tags: '标签', examples: '示例', scenes: '语义场景',
        cancel: '取消', save: '保存', saved: '已保存 ✅',
        existsConfirm: (t) => `词条「${t}」已存在，是否覆盖？`, fillTerm: '请填写术语', other: '其他',
        posPh: 'n./v./adj. ...', tagsPh: '逗号分隔，如 技术, 市场', examplesPh: '每行一个示例', scenesPh: '如 技术写作 / 市场文案',
        muteDomain: '在当前站点隐藏此词', muteGlobal: '在所有站点隐藏此词',
        mutedDomain: (t) => `已在本域隐藏「${t}」`, mutedGlobal: (t) => `已在所有站点隐藏「${t}」`,
        dockTitle: '高亮控制', dockApply: '应用',
        dockClose: '关闭',
        scopeNone: '不关闭（恢复高亮）',
        scopeVisit: '本次关闭（直到下次访问）',
        scopePage: '关闭本页高亮（持久）',
        scopeSite: '关闭本域高亮（持久）'
    } : {
        panelTitle: 'Add to Glow Dictionary',
        term: 'Term', translation: 'Translation', pos: 'Part of Speech', tags: 'Tags', examples: 'Examples', scenes: 'Semantic Scene',
        cancel: 'Cancel', save: 'Save', saved: 'Saved ✅',
        existsConfirm: (t) => `Entry "${t}" exists. Overwrite?`, fillTerm: 'Please input the term', other: 'Other',
        posPh: 'n./v./adj. ...', tagsPh: 'Comma separated, e.g., Tech, Marketing', examplesPh: 'One per line', scenesPh: 'e.g., Technical Writing / Marketing Copy',
        muteDomain: 'Hide this term on this site', muteGlobal: 'Hide this term on all sites',
        mutedDomain: (t) => `Hidden "${t}" on this site`, mutedGlobal: (t) => `Hidden "${t}" everywhere`,
        dockTitle: 'Highlight Control', dockApply: 'Apply',
        dockClose: 'Close',
        scopeNone: 'Keep enabled (restore)',
        scopeVisit: 'Disable for this visit',
        scopePage: 'Disable on this page (persistent)',
        scopeSite: 'Disable on this site (persistent)'
    };

    // dictionaries flags
    const defaults = { enabled: true, useWords: true, usePhrases: false, useSentences: false, usePackV02: true, usePackV03: false };

    // domain/page keys
    function domainKeyFrom(hostname) {
        let host = (hostname || '').replace(/^www\./, '');
        const parts = host.split('.');
        if (parts.length <= 2) return host;
        const special = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'com.au', 'net.au', 'org.au']);
        const last2 = parts.slice(-2).join('.'), last3 = parts.slice(-3).join('.');
        if (special.has(last2)) return parts.slice(-3).join('.');
        if (special.has(last3)) return parts.slice(-4).join('.');
        return last2;
    }
    const DOMAIN_KEY = domainKeyFrom(location.hostname);
    function pageKeyFrom(loc = location) {
        const p = (loc.pathname || '/').replace(/\/+$/, '') || '/';
        return `${loc.origin}${p}`;
    }
    const PAGE_KEY = pageKeyFrom();

    // Shadow host
    const host = document.createElement('div');
    host.id = ROOT_ID;
    Object.assign(host.style, { position: 'fixed', left: 0, top: 0, width: 0, height: 0, zIndex: 2147483647 });
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // Card（无动画）
    const card = document.createElement('div');
    Object.assign(card.style, {
        position: 'fixed', maxWidth: '380px', minWidth: '240px', padding: '12px 14px',
        borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,.18)', background: '#fff',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        fontSize: '14px', lineHeight: 1.5, color: '#222', display: 'none', pointerEvents: 'auto'
    });
    const style = document.createElement('style');
    style.textContent = `
      .title { font-weight: 700; margin-bottom: 6px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .pos { color:#666; margin-left:6px; font-weight:500 }
      .translation { margin: 6px 0 8px; }
      .tag { display:inline-block; margin-right:6px; padding:2px 6px; border-radius:999px; background:#f3f4f6; font-size:12px; }
      .examples li { margin-left: 1em; }
      .icons { display:flex; gap:8px; }
      .iconbtn { width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center;
        border-radius:8px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; color:#111827; }
      .iconbtn:hover { background:#f9fafb; }
      .iconbtn svg { width:16px; height:16px; }
  
      /* 右侧长条控制：默认半隐藏 + 低透明；悬停滑出；点击打开面板 */
      .dock {
        position: fixed; right: -16px; top: 40%; transform: translateY(-50%);
        width: 40px; height: 40px; border-radius: 10px 0 0 10px;
        background: #111827; color: #fff; display:flex; align-items:center; justify-content:center;
        cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.25);
        opacity: .65; transition: right 180ms ease, opacity 180ms ease;
      }
      .dock:hover { right: 0; opacity: 1; }
      .dock svg { width: 18px; height: 18px; }
  
      .panel {
        position: fixed; right: 50px; top: 40%; transform: translateY(-50%) scale(.98);
        min-width: 300px; background:#fff; color:#111; border:1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.18); padding: 12px; display: none;
        opacity: 0; transition: transform 160ms ease, opacity 160ms ease;
      }
      .panel.open { display:block; opacity:1; transform: translateY(-50%) scale(1); }
      .panel h3 { margin: 0 0 8px 0; font-size: 14px; }
      .panel .row { display:flex; align-items:center; gap:8px; margin: 8px 0; }
      .panel .btns { display:flex; gap:8px; justify-content:flex-end; }
      .xbtn { border:none; background:transparent; cursor:pointer; color:#666; }
      .xbtn:hover { color:#111; }
      .rad { display:flex; align-items:center; gap:6px; }
    `;
    shadow.append(style, card);

    function toast(msg) {
        const tip = document.createElement('div');
        tip.textContent = msg;
        Object.assign(tip.style, {
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
            background: '#111827', color: '#fff', padding: '8px 12px', borderRadius: '999px',
            fontSize: '13px', boxShadow: '0 6px 20px rgba(0,0,0,.2)', pointerEvents: 'none'
        });
        shadow.appendChild(tip);
        setTimeout(() => tip.remove(), 1400);
    }

    // Utils
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasLatin = (s) => /[A-Za-z]/.test(s);
    const hasCJK = (s) => /[\u4e00-\u9fff]/.test(s);
    const isCJKChar = (ch) => /[\u4e00-\u9fff]/.test(ch);
    const canonicalKey = (s) => String(s || '').toLowerCase();
    const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'));

    // Flags / dicts
    let FLAGS = { ...defaults };
    let DICT_CUSTOM = {};
    let DICT_BUILTIN = {};
    let DICT = {};

    let MUTE_GLOBAL = new Set();
    let MUTE_BY_DOMAIN = {};
    let DISABLE_PAGE = new Set();
    let DISABLE_DOMAIN_ALL = new Set();

    let LATIN_RE = null;
    let CJK_TRIE = null;

    const isMutedTerm = (key) => MUTE_GLOBAL.has(key) || (MUTE_BY_DOMAIN[DOMAIN_KEY]?.has(key) || false);
    const isPageDisabled = () => DISABLE_PAGE.has(PAGE_KEY);
    const isDomainDisabled = () => DISABLE_DOMAIN_ALL.has(DOMAIN_KEY);
    const isDisabledNow = () => DISABLE_THIS_VISIT || isPageDisabled() || isDomainDisabled() || !FLAGS.enabled;

    // Matchers
    function buildLatinRegex(dict) {
        const words = Object.keys(dict || {});
        const latin = words.filter((w) => /[A-Za-z]/.test(w)).sort((a, b) => b.length - a.length).map(escapeRegex);
        return latin.length ? new RegExp(`\\b(?:${latin.join('|')})\\b`, 'gi') : null;
    }
    function buildCJKTrie(dict) {
        const words = Object.keys(dict || {}).filter((w) => hasCJK(w));
        if (!words.length) return null;
        const root = {};
        for (const w of words) { let node = root; for (const ch of w) node = node[ch] || (node[ch] = {}); node.$ = true; }
        return root;
    }

    async function loadBuiltin() {
        const packs = [];
        if (FLAGS.usePackV02) packs.push('v0.2');
        if (FLAGS.usePackV03) packs.push('v0.3');
        const urls = [];
        for (const pack of packs) {
            if (FLAGS.useWords) urls.push(chrome.runtime.getURL(`assets/dicts/${pack}/words.json`));
            if (FLAGS.usePhrases) urls.push(chrome.runtime.getURL(`assets/dicts/${pack}/phrases.json`));
            if (FLAGS.useSentences) urls.push(chrome.runtime.getURL(`assets/dicts/${pack}/sentences.json`));
        }
        if (!urls.length) { DICT_BUILTIN = {}; return; }
        const arr = await Promise.all(urls.map(u => fetch(u).then(r => r.ok ? r.json() : {}).catch(() => ({}))));
        const merged = {};
        for (const obj of arr) for (const k of Object.keys(obj || {})) merged[canonicalKey(k)] = obj[k];
        DICT_BUILTIN = merged;
    }
    function rebuild() {
        DICT = Object.assign({}, DICT_BUILTIN, DICT_CUSTOM);
        LATIN_RE = buildLatinRegex(DICT);
        CJK_TRIE = buildCJKTrie(DICT);
    }

    // Find matches
    function findCJKMatches(text, trie) {
        if (!trie || !text) return [];
        const res = [];
        for (let i = 0; i < text.length; i++) {
            if (!isCJKChar(text[i])) continue;
            let node = trie, j = i, lastEnd = -1;
            while (j < text.length && (node = node[text[j]])) { if (node.$) lastEnd = j + 1; j++; }
            if (lastEnd > 0) {
                const key = canonicalKey(text.slice(i, lastEnd));
                if (!isMutedTerm(key)) res.push({ start: i, end: lastEnd, key });
                i = lastEnd - 1;
            }
        }
        return res;
    }
    function findLatinMatches(text, re) {
        if (!re || !text) return [];
        const out = []; re.lastIndex = 0; let m;
        while ((m = re.exec(text)) !== null) {
            const key = canonicalKey(m[0]);
            if (!isMutedTerm(key)) out.push({ start: m.index, end: m.index + m[0].length, key });
        }
        return out;
    }
    function mergeMatches(text, latinMs, cjkMs) {
        const ms = [...latinMs, ...cjkMs].sort((a, b) => {
            const la = a.end - a.start, lb = b.end - b.start;
            if (a.start !== b.start) return a.start - b.start;
            return lb - la;
        });
        const chosen = []; let lastEnd = -1;
        for (const m of ms) {
            if (m.start >= lastEnd) { chosen.push(m); lastEnd = m.end; }
            else {
                const prev = chosen[chosen.length - 1];
                if ((m.end - m.start) > (prev.end - prev.start)) { chosen[chosen.length - 1] = m; lastEnd = m.end; }
            }
        }
        return chosen.filter(m => !!DICT[m.key] && !isMutedTerm(m.key));
    }

    // 懒加载相关
    const WATCH_ATTR = 'data-glow-watch';
    const HLED_ATTR = 'data-glow-hl';
    const processedFlag = 'data-glow-processed';

    function shouldSkipElement(el) {
        const name = el.nodeName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'CANVAS', 'CODE', 'PRE', 'TEXTAREA'].includes(name)) return true;
        if (el.closest(`#${ROOT_ID}`)) return true;
        if (el.closest(`.${HIGHLIGHT_CLASS}`)) return true;
        if (el.isContentEditable || el.closest('[contenteditable="true"]')) return true;
        return false;
    }

    function highlightInNode(textNode) {
        const text = textNode.nodeValue; if (!text) return;
        if (!hasLatin(text) && !hasCJK(text)) return;

        const latinMs = findLatinMatches(text, LATIN_RE);
        const cjkMs = findCJKMatches(text, CJK_TRIE);
        if (!latinMs.length && !cjkMs.length) return;

        const matches = mergeMatches(text, latinMs, cjkMs);
        if (!matches.length) return;

        const frag = document.createDocumentFragment(); let last = 0;
        for (const m of matches) {
            if (m.start > last) frag.appendChild(document.createTextNode(text.slice(last, m.start)));
            const span = document.createElement('span');
            span.className = HIGHLIGHT_CLASS;
            span.textContent = text.slice(m.start, m.end);
            span.setAttribute('data-glow-key', m.key);
            frag.appendChild(span);
            last = m.end;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        textNode.parentNode.replaceChild(frag, textNode);
    }

    // 懒加载：仅当元素进入视口时才高亮
    const watchedElements = new Set();
    const io = new IntersectionObserver((entries) => {
        if (isDisabledNow()) return;
        for (const e of entries) {
            const el = e.target;
            if (!e.isIntersecting) continue;
            if (el.getAttribute(HLED_ATTR) === '1') continue;
            el.setAttribute(HLED_ATTR, '1');

            const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const p = node.parentElement; if (!p || shouldSkipElement(p)) return NodeFilter.FILTER_REJECT;
                    const t = node.nodeValue; if (!t || t.length < 2 || t.length > 20000) return NodeFilter.FILTER_REJECT;
                    if (!hasLatin(t) && !hasCJK(t)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            const batch = []; while (tw.nextNode()) batch.push(tw.currentNode);
            for (const n of batch) highlightInNode(n);

            dedupeVisibleThrottled();
        }
    }, { root: null, rootMargin: '200px 0px', threshold: 0 });

    function watchElement(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE || shouldSkipElement(el)) return;
        if (el.getAttribute(WATCH_ATTR) === '1') return;
        el.setAttribute(WATCH_ATTR, '1');
        watchedElements.add(el);
        io.observe(el);
    }

    function collectWatchTargets(root = document.body) {
        if (isDisabledNow()) return;
        if (!LATIN_RE && !CJK_TRIE) return;
        if (!root || root.hasAttribute?.(processedFlag)) return;

        root.setAttribute?.(processedFlag, '1');

        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const p = node.parentElement; if (!p || shouldSkipElement(p)) return NodeFilter.FILTER_REJECT;
                const t = node.nodeValue; if (!t || t.length < 2 || t.length > 20000) return NodeFilter.FILTER_REJECT;
                if (!hasLatin(t) && !hasCJK(t)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const parents = new Set();
        while (tw.nextNode()) {
            const p = tw.currentNode.parentElement;
            if (p) parents.add(p);
        }
        parents.forEach(watchElement);
        root.removeAttribute?.(processedFlag);
    }

    // Card 渲染（无动画）
    function renderCardForKey(key) {
        const e = DICT[key]; if (!e) return '';
        const tags = (e.tags || []).map(t => `<span class="tag">${t}</span>`).join(' ');
        const examples = (e.examples || []).slice(0, 3).map(s => `<li>${s}</li>`).join('');
        const pos = e.pos ? `<span class="pos">${e.pos}</span>` : '';
        const scenes = e.scenes ? (Array.isArray(e.scenes) ? e.scenes.join(' / ') : e.scenes) : '';
        const icons = `
        <div class="icons">
          <button class="iconbtn" data-action="mute-domain" title="${I18N.muteDomain}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="10" rx="2" ry="2"></rect><rect x="7" y="4" width="10" height="5" rx="1.5" ry="1.5"></rect><path d="M3 12h18"></path></svg>
          </button>
          <button class="iconbtn" data-action="mute-global" title="${I18N.muteGlobal}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M5 5l14 14"></path></svg>
          </button>
        </div>`;
        return `
        <div class="title">
          <div>${key}${pos}</div>
          ${icons}
        </div>
        <div class="translation">${e.translation || ''}</div>
        ${scenes ? `<div style="color:#666;margin-bottom:8px;">${scenes}</div>` : ''}
        ${tags ? `<div style="margin-bottom:8px;">${tags}</div>` : ''}
        ${examples ? `<ul class="examples">${examples}</ul>` : ''}
      `;
    }

    // 更贴近的定位：先测量，再靠近锚点约 4px
    function positionCard(anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const GAP = 4;

        // 为测量先显示到屏外
        card.style.visibility = 'hidden';
        card.style.display = 'block';
        card.style.left = '-9999px';
        card.style.top = '-9999px';

        const cw = card.offsetWidth;
        const ch = card.offsetHeight;
        const maxX = vw - cw - 8;

        let x = Math.max(8, Math.min(rect.left, maxX));
        let y = rect.top - ch - GAP;
        if (y < 8) y = rect.bottom + GAP;

        card.style.left = `${Math.round(x)}px`;
        card.style.top = `${Math.round(y)}px`;
        card.style.visibility = 'visible';
    }

    // 即时显示/隐藏（无动画）
    let currentKey = '';
    function showCardFor(el) {
        const key = el.getAttribute('data-glow-key'); if (!key) return;
        if (currentKey !== key) {
            card.innerHTML = renderCardForKey(key);
            const btnDom = card.querySelector('[data-action="mute-domain"]');
            const btnAll = card.querySelector('[data-action="mute-global"]');
            btnDom?.addEventListener('click', (e) => { e.stopPropagation(); addMuteForDomain(key); });
            btnAll?.addEventListener('click', (e) => { e.stopPropagation(); addMuteGlobal(key); });
            currentKey = key;
        }
        positionCard(el);
        card.style.display = 'block';
    }
    function hideCard() { card.style.display = 'none'; }

    // 悬停保持/切换（增加延迟处理，优化体验）
    let cardShowTimer = null;
    let cardHideTimer = null;

    document.addEventListener('pointermove', (e) => {
        const path = e.composedPath ? e.composedPath() : [];
        const overCard = path.includes(card);
        const hl = path.find(n => n && n.classList?.contains(HIGHLIGHT_CLASS));

        if (hl) {
            // 鼠标悬停在高亮区域
            clearTimeout(cardHideTimer);
            if (cardShowTimer) return; // 如果已经在计划显示，则不重复设置
            cardShowTimer = setTimeout(() => {
                showCardFor(hl);
                cardShowTimer = null;
            }, 200);
        } else {
            // 鼠标不在任何高亮区域
            clearTimeout(cardShowTimer);
            cardShowTimer = null;
            if (card.style.display === 'block' && !overCard) {
                if (cardHideTimer) return; // 如果已经在计划隐藏，则不重复设置
                cardHideTimer = setTimeout(() => {
                    hideCard();
                    cardHideTimer = null;
                }, 300);
            } else if (overCard) {
                // 鼠标在卡片上，取消隐藏
                clearTimeout(cardHideTimer);
                cardHideTimer = null;
            }
        }
    }, { capture: true, passive: true });

    document.addEventListener('scroll', () => {
        clearTimeout(cardShowTimer);
        clearTimeout(cardHideTimer);
        cardShowTimer = null;
        cardHideTimer = null;
        hideCard();
    }, { passive: true, capture: true });

    window.addEventListener('resize', () => {
        clearTimeout(cardShowTimer);
        clearTimeout(cardHideTimer);
        cardShowTimer = null;
        cardHideTimer = null;
        hideCard();
    }, { passive: true });

    // 可视区去重
    function dedupeVisible() {
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;
        const spans = Array.from(document.querySelectorAll(`.${HIGHLIGHT_CLASS}`));
        const items = [];
        for (const el of spans) {
            const r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
            items.push({ el, r, key: el.getAttribute('data-glow-key') || '' });
        }
        items.sort((a, b) => (a.r.top - b.r.top) || (a.r.left - b.r.left));
        const seen = new Set();
        for (const it of items) {
            const k = it.key; if (!k) continue;
            if (seen.has(k)) {
                const t = document.createTextNode(it.el.textContent || ''); it.el.replaceWith(t);
            } else seen.add(k);
        }
    }
    let dedupeTick = 0;
    function dedupeVisibleThrottled() { const now = Date.now(); if (now - dedupeTick < 120) return; dedupeTick = now; dedupeVisible(); }

    // 屏蔽/删除高亮
    function removeHighlightsByKey(key) {
        document.querySelectorAll(`.${HIGHLIGHT_CLASS}[data-glow-key="${cssEscape(key)}"]`).forEach(el => {
            const t = document.createTextNode(el.textContent || ''); el.replaceWith(t);
        });
        hideCard();
    }
    function removeAllHighlights() {
        document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
            const t = document.createTextNode(el.textContent || ''); el.replaceWith(t);
        });
        watchedElements.forEach(el => el.removeAttribute(HLED_ATTR)); // 允许再次进入视口重新构建
        hideCard();
    }

    // 保存屏蔽/禁用
    function saveMuteState() {
        const dumpGlobal = Array.from(MUTE_GLOBAL);
        const dumpDomain = {}; for (const d in MUTE_BY_DOMAIN) dumpDomain[d] = Array.from(MUTE_BY_DOMAIN[d]);
        chrome.storage.local.set({ [MUTE_GLOBAL_KEY]: dumpGlobal, [MUTE_BY_DOMAIN_KEY]: dumpDomain });
    }
    function addMuteGlobal(key) { MUTE_GLOBAL.add(key); saveMuteState(); removeHighlightsByKey(key); toast(I18N.mutedGlobal(key)); }
    function addMuteForDomain(key) { (MUTE_BY_DOMAIN[DOMAIN_KEY] ||= new Set()).add(key); saveMuteState(); removeHighlightsByKey(key); toast(I18N.mutedDomain(key)); }

    function saveDisableState() {
        chrome.storage.local.set({
            [DISABLE_BY_PAGE_KEY]: Array.from(DISABLE_PAGE),
            [DISABLE_BY_DOMAIN_ALL_KEY]: Array.from(DISABLE_DOMAIN_ALL)
        });
    }

    // 右侧长条控制（半隐藏、悬停滑出；点击展开面板）
    const dock = document.createElement('div');
    dock.className = 'dock';
    dock.title = I18N.dockTitle;
    dock.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M10 6l-6 6 6 6"/></svg>`;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <h3>${I18N.dockTitle}</h3>
        <button class="xbtn" title="${I18N.dockClose}" aria-label="${I18N.dockClose}">
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 14L34 34" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 34L34 14" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="row rad">
        <input id="scopeVisit" type="radio" name="disScope" value="visit" />
        <label for="scopeVisit">${I18N.scopeVisit}</label>
      </div>
      <div class="row rad">
        <input id="scopePage" type="radio" name="disScope" value="page" />
        <label for="scopePage">${I18N.scopePage}</label>
      </div>
      <div class="row rad">
        <input id="scopeSite" type="radio" name="disScope" value="site" />
        <label for="scopeSite">${I18N.scopeSite}</label>
      </div>
      <div class="btns">
        <button id="apply" class="xbtn" style="border:1px solid #111827;border-radius:10px;padding:6px 10px;color:#111827;">${I18N.dockApply}</button>
      </div>
    `;

    shadow.append(dock, panel);

    function currentScope() {
        if (DISABLE_THIS_VISIT) return 'visit';
        if (DISABLE_DOMAIN_ALL.has(DOMAIN_KEY)) return 'site';
        if (DISABLE_PAGE.has(PAGE_KEY)) return 'page';
        return 'none';
    }

    function syncDockUI() {
        const val = currentScope();
        panel.querySelectorAll('input[name="disScope"]').forEach(r => { r.checked = (r.value === val); });
    }

    function openPanel() {
        syncDockUI();
        panel.style.display = 'block';
        panel.classList.add('open');
    }
    function closePanel() {
        panel.classList.remove('open');
        setTimeout(() => panel.style.display = 'none', 160);
    }

    dock.addEventListener('click', (e) => { e.stopPropagation(); openPanel(); });
    panel.querySelector('.xbtn').addEventListener('click', (e) => { e.stopPropagation(); closePanel(); });
    panel.querySelector('#apply').addEventListener('click', (e) => {
        e.stopPropagation();
        const sel = panel.querySelector('input[name="disScope"]:checked')?.value || 'none';

        // 单选逻辑：选择一种关闭范围（或恢复）
        if (sel === 'none') {
            DISABLE_THIS_VISIT = false;
            DISABLE_PAGE.delete(PAGE_KEY);
            DISABLE_DOMAIN_ALL.delete(DOMAIN_KEY);
            saveDisableState();
            rebuild(); collectWatchTargets(document.body);
        } else if (sel === 'visit') {
            DISABLE_THIS_VISIT = true;
            DISABLE_PAGE.delete(PAGE_KEY);
            DISABLE_DOMAIN_ALL.delete(DOMAIN_KEY);
            saveDisableState();
            removeAllHighlights();
        } else if (sel === 'page') {
            DISABLE_THIS_VISIT = false;
            DISABLE_PAGE.add(PAGE_KEY);
            DISABLE_DOMAIN_ALL.delete(DOMAIN_KEY);
            saveDisableState();
            removeAllHighlights();
        } else if (sel === 'site') {
            DISABLE_THIS_VISIT = false;
            DISABLE_PAGE.delete(PAGE_KEY);
            DISABLE_DOMAIN_ALL.add(DOMAIN_KEY);
            saveDisableState();
            removeAllHighlights();
        }

        closePanel();
        // 隐藏dock
        dock.style.display = 'none';
    });

    // 点击页面其他位置关闭 panel（含 ShadowDOM 之外）
    // 监听主文档与 shadow，两边都加以确保可靠
    function onOutsideClick(ev) {
        if (panel.style.display !== 'block') return;
        const path = ev.composedPath ? ev.composedPath() : [];
        if (path.includes(panel) || path.includes(dock)) return; // 点击在 panel 或 dock 上不关闭
        closePanel();
    }
    document.addEventListener('pointerdown', onOutsideClick, true);
    shadow.addEventListener('pointerdown', onOutsideClick, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); }, true);
    shadow.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); }, true);

    // Mutation：新增节点注册懒加载
    const mo = new MutationObserver((muts) => {
        if (isDisabledNow()) return;
        const nodes = new Set();
        for (const m of muts) {
            if (m.type === 'childList') {
                m.addedNodes.forEach(n => {
                    if (n.nodeType === Node.ELEMENT_NODE && !shouldSkipElement(n)) nodes.add(n);
                    else if (n.nodeType === Node.TEXT_NODE && n.parentElement && !shouldSkipElement(n.parentElement)) nodes.add(n.parentElement);
                });
            } else if (m.type === 'characterData' && m.target.parentElement && !shouldSkipElement(m.target.parentElement)) {
                nodes.add(m.target.parentElement);
            }
        }
        if (!nodes.size) return;
        const job = () => { nodes.forEach(n => collectWatchTargets(n)); dedupeVisibleThrottled(); };
        if ('requestIdleCallback' in window) requestIdleCallback(job, { timeout: 500 }); else setTimeout(job, 50);
    });

    // 初始化
    (async function init() {
        const res = await new Promise(r => chrome.storage.local.get([FLAGS_KEY, CUSTOM_KEY, MUTE_GLOBAL_KEY, MUTE_BY_DOMAIN_KEY, DISABLE_BY_PAGE_KEY, DISABLE_BY_DOMAIN_ALL_KEY], r));
        FLAGS = Object.assign({}, defaults, res[FLAGS_KEY] || {});
        DICT_CUSTOM = res[CUSTOM_KEY] || {};
        MUTE_GLOBAL = new Set(res[MUTE_GLOBAL_KEY] || []);
        const raw = res[MUTE_BY_DOMAIN_KEY] || {}; MUTE_BY_DOMAIN = {}; for (const d of Object.keys(raw)) MUTE_BY_DOMAIN[d] = new Set(raw[d] || []);
        DISABLE_PAGE = new Set(res[DISABLE_BY_PAGE_KEY] || []);
        DISABLE_DOMAIN_ALL = new Set(res[DISABLE_BY_DOMAIN_ALL_KEY] || []);

        await loadBuiltin();
        rebuild();

        if (!isDisabledNow() && (LATIN_RE || CJK_TRIE)) {
            collectWatchTargets(document.body);
            mo.observe(document.body, { childList: true, subtree: true, characterData: true });
        }
    })();

    // 响应设置变化
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'local') return;
        let needReload = false, needRebuild = false;
        if (changes[FLAGS_KEY]) {
            const nv = changes[FLAGS_KEY].newValue || {};
            FLAGS = Object.assign({}, FLAGS, nv);
            if (nv.usePackV02 !== undefined || nv.usePackV03 !== undefined || 'useWords' in nv || 'usePhrases' in nv || 'useSentences' in nv) needReload = true;
            if (nv.enabled !== undefined) needRebuild = true;
        }
        if (changes[CUSTOM_KEY]) { DICT_CUSTOM = changes[CUSTOM_KEY].newValue || {}; needRebuild = true; }
        if (changes[MUTE_GLOBAL_KEY]) MUTE_GLOBAL = new Set(changes[MUTE_GLOBAL_KEY].newValue || []);
        if (changes[MUTE_BY_DOMAIN_KEY]) {
            const raw = changes[MUTE_BY_DOMAIN_KEY].newValue || {}; MUTE_BY_DOMAIN = {}; for (const d of Object.keys(raw)) MUTE_BY_DOMAIN[d] = new Set(raw[d] || []);
        }
        if (changes[DISABLE_BY_PAGE_KEY]) DISABLE_PAGE = new Set(changes[DISABLE_BY_PAGE_KEY].newValue || []);
        if (changes[DISABLE_BY_DOMAIN_ALL_KEY]) DISABLE_DOMAIN_ALL = new Set(changes[DISABLE_BY_DOMAIN_ALL_KEY].newValue || []);

        if (needReload) await loadBuiltin();
        if (needReload || needRebuild) {
            rebuild();
            if (isDisabledNow()) removeAllHighlights();
            else { collectWatchTargets(document.body); dedupeVisibleThrottled(); }
        }
    });

    // 后台消息
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'glow.openAdd') openAddModal(String(msg.term || ''));
        if (msg?.type === 'glow.toast' && msg.text) toast(String(msg.text));
    });

    // —— 右键加词（低输入面板）：保留原功能 —— //
    let addOverlay = null;
    const POS_OPTIONS = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'det.', 'num.', 'abbr.', 'idiom', 'phr.'];
    const TAG_OPTIONS = LANG_ZH ? ['技术', '市场', '视频', '音频', '摄影', '直播', '无线', '麦克风', '对讲', '固件', '应用', '性能', '可靠性']
        : ['Tech', 'Marketing', 'Video', 'Audio', 'Photography', 'Livestreaming', 'Wireless', 'Microphone', 'Intercom', 'Firmware', 'App', 'Performance', 'Reliability'];
    const SCENE_OPTIONS = LANG_ZH ? ['技术写作', '市场文案', '产品描述', '用户手册', '脚本/分镜', '社媒/EDM']
        : ['Technical Writing', 'Marketing Copy', 'Product Description', 'User Manual', 'Script/Storyboard', 'Social/EDM'];

    function buildCheckboxGroup(name, options) {
        return options.map(opt => `
        <label style="display:inline-flex;align-items:center;gap:6px;margin:4px 10px 4px 0;">
          <input type="checkbox" name="${name}" value="${opt}" />
          <span>${opt}</span>
        </label>`).join('');
    }

    function openAddModal(initialTerm = '') {
        if (!addOverlay) {
            addOverlay = document.createElement('div');
            Object.assign(addOverlay.style, { position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box', pointerEvents: 'auto', zIndex: '2147483647' });
            const panel = document.createElement('div');
            Object.assign(panel.style, { background: '#fff', borderRadius: '14px', boxShadow: '0 10px 40px rgba(0,0,0,.2)', width: 'min(720px,92vw)', padding: '18px', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial', color: '#222' });
            panel.innerHTML = `
          <div style="font-size:16px;font-weight:700;margin-bottom:10px;">${I18N.panelTitle}</div>
          <div style="display:grid;grid-template-columns:120px 1fr;gap:10px 14px;align-items:center;">
            <label>${I18N.term}</label>
            <input id="glow-term" style="padding:8px;border:1px solid #e5e7eb;border-radius:10px;outline:none;" />
            <label>${I18N.translation}</label>
            <input id="glow-translation" style="padding:8px;border:1px solid #e5e7eb;border-radius:10px;outline:none;" />
            <label>${I18N.pos}</label>
            <div>
              <select id="glow-pos" style="padding:8px;border:1px solid #e5e7eb;border-radius:10px;outline:none;">
                <option value="">--</option>
                ${POS_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join('')}
                <option value="__other">${LANG_ZH ? '其他' : 'Other'}</option>
              </select>
              <input id="glow-pos-other" placeholder="${LANG_ZH ? 'n./v./adj. ...' : 'n./v./adj. ...'}" style="display:none;margin-top:8px;padding:8px;border:1px solid #e5e7eb;border-radius:10px;outline:none;" />
            </div>
            <label>${I18N.tags}</label>
            <div>
              <div id="glow-tags-box" style="display:flex;flex-wrap:wrap;gap:0 8px;">${buildCheckboxGroup('glow-tags', TAG_OPTIONS)}</div>
              <input id="glow-tags-other" placeholder="${LANG_ZH ? '逗号分隔，如 技术, 市场' : 'Comma separated, e.g., Tech, Marketing'}" style="margin-top:8px;width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:10px;outline:none;" />
            </div>
            <label>${I18N.examples}</label>
            <textarea id="glow-examples" rows="3" placeholder="${LANG_ZH ? '每行一个示例' : 'One per line'}" style="padding:8px;border:1px solid #e5e7eb;border-radius:10px;outline:none;resize:vertical;"></textarea>
            <label>${I18N.scenes}</label>
            <div>
              <select id="glow-scenes" style="padding:8px;border:1px solid #e5e7eb;border-radius:10px;outline:none;">
                <option value="">--</option>
                ${SCENE_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
                <option value="__other">${LANG_ZH ? '其他' : 'Other'}</option>
              </select>
              <input id="glow-scenes-other" placeholder="${LANG_ZH ? '如 技术写作 / 市场文案' : 'e.g., Technical Writing / Marketing Copy'}" style="display:none;margin-top:8px;padding:8px;border:1px solid #e5e7eb;border-radius:10px;outline:none;" />
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
            <button id="glow-cancel" style="padding:8px 14px;border-radius:10px;border:1px solid #e5e7eb;cursor:pointer;">${I18N.cancel}</button>
            <button id="glow-save" style="padding:8px 14px;border-radius:10px;border:1px solid #111827;background:#111827;color:#fff;cursor:pointer;">${I18N.save}</button>
          </div>`;
            addOverlay.appendChild(panel); shadow.appendChild(addOverlay);
            addOverlay.addEventListener('click', (e) => { if (e.target === addOverlay) closeAddModal(); });
            shadow.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAddModal(); });
            const $ = (id) => addOverlay.querySelector(id);
            const posSel = $('#glow-pos'), posOther = $('#glow-pos-other');
            const scenesSel = $('#glow-scenes'), scenesOther = $('#glow-scenes-other');
            posSel.addEventListener('change', () => { posOther.style.display = posSel.value === '__other' ? 'block' : 'none'; });
            scenesSel.addEventListener('change', () => { scenesOther.style.display = scenesSel.value === '__other' ? 'block' : 'none'; });
            $('#glow-cancel').addEventListener('click', closeAddModal);
            $('#glow-save').addEventListener('click', () => {
                const term = $('#glow-term').value.trim(); if (!term) { toast(LANG_ZH ? '请填写术语' : 'Please input the term'); return; }
                const key = canonicalKey(term);
                const entry = {
                    translation: $('#glow-translation').value.trim(),
                    pos: (posSel.value === '__other' ? posOther.value.trim() : posSel.value.trim()),
                    tags: [
                        ...Array.from(addOverlay.querySelectorAll('input[name="glow-tags"]:checked')).map(i => i.value),
                        ...$('#glow-tags-other').value.split(',').map(s => s.trim()).filter(Boolean)
                    ],
                    examples: $('#glow-examples').value.split('\n').map(s => s.trim()).filter(Boolean),
                    scenes: (scenesSel.value === '__other' ? scenesOther.value.trim() : scenesSel.value.trim())
                };
                const doSave = () => chrome.storage.local.get(CUSTOM_KEY, (res) => {
                    const dict = res[CUSTOM_KEY] || {}; dict[key] = entry;
                    chrome.storage.local.set({ [CUSTOM_KEY]: dict }, () => { toast(I18N.saved); setTimeout(closeAddModal, 250); });
                });
                chrome.storage.local.get(CUSTOM_KEY, (res) => {
                    const dict = res[CUSTOM_KEY] || {};
                    if (dict[key]) confirmInOverlay((LANG_ZH ? `词条「${term}」已存在，是否覆盖？` : `Entry "${term}" exists. Overwrite?`), doSave);
                    else doSave();
                });
            });
        }
        addOverlay.querySelector('#glow-term').value = (initialTerm || '').trim().slice(0, 200);
        addOverlay.style.display = 'flex';
        setTimeout(() => addOverlay.querySelector('#glow-translation')?.focus(), 0);
    }
    function closeAddModal() { if (addOverlay) addOverlay.style.display = 'none'; }
    function confirmInOverlay(msg, onYes) {
        const box = document.createElement('div');
        Object.assign(box.style, { position: 'fixed', left: '50%', top: '24px', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,.18)', padding: '12px', fontFamily: 'system-ui', zIndex: '2147483647' });
        box.innerHTML = `
        <div style="margin-bottom:10px;">${msg}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="c-no" style="padding:6px 12px;border-radius:10px;border:1px solid #e5e7eb;cursor:pointer;">${I18N.cancel}</button>
          <button id="c-yes" style="padding:6px 12px;border-radius:10px;border:1px solid #111827;background:#111827;color:#fff;cursor:pointer;">${I18N.save}</button>
        </div>`;
        shadow.appendChild(box);
        box.querySelector('#c-no').addEventListener('click', () => box.remove());
        box.querySelector('#c-yes').addEventListener('click', () => { box.remove(); onYes && onYes(); });
    }
})();
