/**
 * 用法：
 * 1) 在 tools/input/ 放入你的 CSV：
 *    - cet4_words.csv, cet4_phrases.csv, cet4_sentences.csv
 *    - 列：term,translation,pos,tags,examples,scenes（逗号分隔；tags/examples 可用 ; 分隔多项）
 * 2) 配置下面的数量 splitCounts 后运行：
 *    node tools/build_packs.js
 * 3) 输出：
 *    assets/dicts/v0.2/{words,phrases,sentences}.json
 *    assets/dicts/v0.3/{words,phrases,sentences}.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IN_DIR = path.join(__dirname, "input");
const OUT_V02 = path.join(__dirname, "..", "assets", "dicts", "v0.2");
const OUT_V03 = path.join(__dirname, "..", "assets", "dicts", "v0.3");

// 你可以按需修改规模：words v0.2=2000, v0.3=1500；phrases/sentences“类似”
const splitCounts = {
    words: { v02: 2000, v03: 1500 },
    phrases: { v02: 800, v03: 600 },
    sentences: { v02: 200, v03: 150 }
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function parseCSV(text) {
    // 简易 CSV：按行 split；支持用逗号分列；引号与转义可按需要升级
    const lines = text.split(/\r?\n/).filter(Boolean);
    const head = lines[0].split(",").map(s => s.trim().toLowerCase());
    const idx = (name) => head.indexOf(name);
    const out = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(s => s.trim());
        const term = (cols[idx("term")] || "").toLowerCase();
        if (!term) continue;
        const obj = {};
        const translation = cols[idx("translation")] || "";
        if (translation) obj.translation = translation;
        const pos = cols[idx("pos")] || "";
        if (pos) obj.pos = pos;
        const tags = cols[idx("tags")] || "";
        if (tags) obj.tags = tags.split(";").map(s => s.trim()).filter(Boolean);
        const examples = cols[idx("examples")] || "";
        if (examples) obj.examples = examples.split(";").map(s => s.trim()).filter(Boolean);
        const scenes = cols[idx("scenes")] || "";
        if (scenes) obj.scenes = scenes;
        out.push([term, obj]);
    }
    return out;
}

function arrToDict(arr) {
    const d = {};
    for (const [k, v] of arr) d[k] = v;
    return d;
}

function splitAndWrite(kind, list) {
    const need = splitCounts[kind];
    if (!need) throw new Error(`no split count for ${kind}`);

    const uniq = new Map();
    for (const [k, v] of list) if (!uniq.has(k)) uniq.set(k, v);
    const all = Array.from(uniq.entries());

    if (all.length < (need.v02 + need.v03)) {
        console.warn(`[WARN] ${kind} 总数 ${all.length} 少于期望 ${need.v02 + need.v03}，将尽可能多地切分。`);
    }

    const v02 = all.slice(0, need.v02);
    const v03 = all.slice(need.v02, need.v02 + need.v03);

    ensureDir(OUT_V02); ensureDir(OUT_V03);
    fs.writeFileSync(path.join(OUT_V02, `${kind}.json`), JSON.stringify(arrToDict(v02), null, 2), "utf8");
    fs.writeFileSync(path.join(OUT_V03, `${kind}.json`), JSON.stringify(arrToDict(v03), null, 2), "utf8");

    console.log(`[OK] ${kind}: v0.2=${v02.length}, v0.3=${v03.length}`);
}

function main() {
    const files = {
        words: path.join(IN_DIR, "cet4_words.csv"),
        phrases: path.join(IN_DIR, "cet4_phrases.csv"),
        sentences: path.join(IN_DIR, "cet4_sentences.csv")
    };
    const lists = {};
    for (const k of Object.keys(files)) {
        if (!fs.existsSync(files[k])) throw new Error(`缺少输入：${files[k]}`);
        lists[k] = parseCSV(fs.readFileSync(files[k], "utf8"));
    }
    splitAndWrite("words", lists.words);
    splitAndWrite("phrases", lists.phrases);
    splitAndWrite("sentences", lists.sentences);
}

main();
