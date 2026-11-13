import assert from 'assert'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'
import parseArticle from '../src/parseArticle.mjs'


//parseArticle(Readability路徑)對jsdom之依賴行為, 以jsdom 31.0.0之行為鎖定(2026-11-14自30.1.3升級)。
//
//本檔刻意不使用替身: 真jsdom、真Readability; 唯一之「伺服器」為本機真HTTP伺服器, 僅用來計數請求(被測碼對它沒有任何依賴)。
//fixture之形態取自真實網頁之常見寫法(分析/廣告script、preload與樣式表、內嵌style、noscript、JSON-LD、舊式CMS之大寫style屬性、
//舊IE之CSS hack、畸形CSS), 非照實作構造; 升級時另以10個真實頁面(維基百科中英文、MDN、RFC、古騰堡、BBC、衛報等)做過修前/修後等價比對
//(結果見 sgud/exp/experience.md 之jsdom 31條), 真實頁面因著作權與體積不入庫。
//
//jsdom 31之破壞性變更與本檔各組之對應:
//  1. HTML解析改非同步、遇阻塞式script暫停 → 「不對外取資源」組(本套件未設runScripts/resources, 須維持建構子返回即完整、且不發出請求)
//  2. CSS引擎重寫 → 「inline style隱藏判定」組(Readability只讀 node.style.display/visibility)與「不寫入呼叫端之console」組
//  3. 解析錯誤改經virtualConsole回報 → 「不寫入呼叫端之console」組、「src內jsdom使用站點之接線」組


//Readability需要夠長之正文才會取出(charThreshold 500), 段落以逗號分句以通過其計分
let para = (tag) => '<p>' + tag + ': the quick brown fox jumps over the lazy dog, again and again, while the committee reviews the quarterly figures, notes the changes, and files the report on time.</p>'
let paras = (n, tag = 'P') => Array.from({ length: n }, (_, i) => para(tag + (i + 1))).join('\n')
let page = (head, body) => '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Test Page Title - Site</title>' + head + '</head><body>' + body + '</body></html>'
let ART = '<h1>Headline of the Article</h1>\n' + paras(8)
let URL_PAGE = 'https://example.org/post/1'

let MARK = (tag) => 'MARK-' + tag + ' this marker sentence is long enough, with commas, to be counted by the reader as real content of the article body.'


describe('不對外取資源(jsdom 31起解析遇阻塞式script會暫停, 本套件未設runScripts/resources, 須維持建構子返回即完整且不發請求)', function() {

    let server
    let port
    let hits = []

    before(async function() {
        server = http.createServer((req, res) => {
            hits.push(req.url)
            res.statusCode = 200
            res.end('')
        })
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
        port = server.address().port
    })

    after(async function() {
        await new Promise(resolve => server.close(resolve))
    })

    beforeEach(function() {
        hits.length = 0
    })

    it('head與body中段之阻塞式外部script、link樣式表、@import、img、iframe、object、embed皆不發請求, 阻塞點之後之內容完整保留', async function() {
        let o = 'http://127.0.0.1:' + port
        let head =
            '<script src="' + o + '/head-blocking-1.js"></script><script src="' + o + '/head-blocking-2.js"></script>' +
            '<script async src="' + o + '/a.js"></script><script defer src="' + o + '/d.js"></script><script type="module" src="' + o + '/m.js"></script>' +
            '<link rel="preload" as="script" href="' + o + '/p.js"><link rel="stylesheet" href="' + o + '/head.css">' +
            '<style>@import url("' + o + '/imp.css"); body{font:16px serif}</style>'
        let body = '<article>' + paras(3) +
            '<script src="' + o + '/mid-blocking.js"></script>' +
            '<p>' + MARK('AFTER-MID-BLOCKING-SCRIPT') + '</p>' +
            '<img src="' + o + '/i.png"><iframe src="' + o + '/f.html"></iframe><object data="' + o + '/o.swf"></object><embed src="' + o + '/e.swf">' +
            '<link rel="stylesheet" href="' + o + '/body.css">' +
            paras(3, 'Q') + '<p>' + MARK('LAST-PARAGRAPH') + '</p></article>' +
            '<noscript><iframe src="' + o + '/gtm.html"></iframe></noscript>'
        let t = await parseArticle(page(head, body), URL_PAGE, null)

        //否定斷言才用短暫觀察窗: 若有遲到之請求, 於此窗內到達
        await new Promise(resolve => setTimeout(resolve, 200))

        let r = [
            t.success,
            t.content.includes('MARK-AFTER-MID-BLOCKING-SCRIPT'),
            t.content.includes('MARK-LAST-PARAGRAPH'),
            hits,
        ]
        let rr = [true, true, true, []]
        assert.strict.deepEqual(r, rr)
    })

    it('大量(300個)阻塞式外部script之頁面, 內容完整且零請求', async function() {
        let o = 'http://127.0.0.1:' + port
        let head = Array.from({ length: 300 }, (_, i) => '<script src="' + o + '/s' + i + '.js"></script>').join('')
        let t = await parseArticle(page(head, '<article>' + ART + '<p>' + MARK('END') + '</p></article>'), URL_PAGE, null)
        await new Promise(resolve => setTimeout(resolve, 200))
        let r = [t.success, t.content.includes('MARK-END'), hits.length]
        let rr = [true, true, 0]
        assert.strict.deepEqual(r, rr)
    })

})


describe('script不執行', function() {

    it('內嵌script之document.write與document.title指派皆不生效, script內文不混入正文', async function() {
        let head = '<script>document.title="CHANGED-BY-SCRIPT"; var gtm = "SCRIPT-BODY-TEXT-IN-HEAD"</script>' +
            '<script type="application/json" id="__NEXT_DATA__">{"props":{"note":"SCRIPT-BODY-TEXT-IN-JSON"}}</script>'
        let body = '<article>' + paras(4) +
            '<script>document.write("<p>WRITTEN-BY-SCRIPT</p>"); window.__EXEC = 1</script>' +
            paras(4, 'Q') + '</article>' +
            '<script>var unclosedTail = "SCRIPT-BODY-TEXT-UNCLOSED";'
        let t = await parseArticle(page(head, body), URL_PAGE, null)
        let r = [
            t.success,
            t.title,
            t.content.includes('WRITTEN-BY-SCRIPT'),
            t.content.includes('SCRIPT-BODY-TEXT'),
        ]
        let rr = [true, 'Test Page Title - Site', false, false]
        assert.strict.deepEqual(r, rr)
    })

    it('依HTML規範, script內之"<!--"之後接"<script"會進入double escaped狀態, 真正之</script>不結束該script, 其後內容皆為script文字', async function() {
        //此為真實網頁(模板引擎、舊式統計碼)會踩到之寫法, 瀏覽器亦同樣吞掉其後內容; 此處鎖定剖析器(parse5)遵循規範之行為,
        //使parse5升版(本次8.0.1→8.1.0)若改變此行為會被察覺。jsdom 30.1.3與31.0.0之結果相同
        let head = '<script>if (1<2 && "</div>" && "<!--") { var s = "<script>x</scr"+"ipt>"; }</script>'
        let t = await parseArticle(page(head, '<article>' + ART + '<p>' + MARK('AFTER-ESCAPED-SCRIPT') + '</p></article>'), URL_PAGE, null)
        let r = [t.success, t.reason]
        let rr = [false, 'empty-content']
        assert.strict.deepEqual(r, rr)
    })

})


describe('inline style隱藏判定(Readability之_isProbablyVisible只讀node.style.display/visibility與hidden、aria-hidden屬性)', function() {

    //每列: [說明, 包裹元素之屬性, 是否應被視為隱藏(正文不含其標記句)]
    //依據: CSS之屬性名稱與關鍵字不分大小寫; display:none 與 visibility:hidden 為隱藏; hidden屬性、aria-hidden="true"為隱藏;
    //語法不合法之宣告無效(元素仍可見); 僅由樣式表(class)隱藏者不在inline style內, Readability不評估樣式表, 故仍可見
    let cases = [
        ['display:none', 'style="display:none"', true],
        ['display: none(含空白)', 'style="display: none"', true],
        ['DISPLAY:NONE(屬性名大寫, jsdom 31起才正確判為隱藏; 30.1.3視為可見)', 'style="DISPLAY:NONE"', true],
        ['display:NONE(值大寫)', 'style="display:NONE"', true],
        ['display:none !important', 'style="display:none !important"', true],
        ['visibility:hidden', 'style="visibility:hidden"', true],
        ['自訂屬性在前', 'style="--x:1;display:none"', true],
        ['尾端多個分號', 'style="display:none;;"', true],
        ['hidden屬性', 'hidden', true],
        ['aria-hidden="true"', 'aria-hidden="true"', true],
        ['display:block', 'style="display:block"', false],
        ['缺冒號之畸形宣告', 'style="display none"', false],
        ['大括號包住之畸形宣告', 'style="{display:none}"', false],
        ['display:var(--d)', 'style="display:var(--d)"', false],
        ['visibility:collapse(非hidden)', 'style="visibility:collapse"', false],
        ['visibility:visible', 'style="visibility:visible"', false],
        ['aria-hidden="false"', 'aria-hidden="false"', false],
        ['僅由樣式表之class隱藏', 'class="hide"', false],
    ]

    for (let [name, attrs, hidden] of cases) {
        it((hidden ? '隱藏: ' : '可見: ') + name, async function() {
            let head = '<style>.hide{display:none}</style>'
            let body = '<article>' + paras(4) + '<div ' + attrs + '><p>' + MARK('TARGET') + '</p></div>' + paras(4, 'Q') + '</article>'
            let t = await parseArticle(page(head, body), URL_PAGE, null)
            let r = [t.success, t.content.includes('MARK-TARGET')]
            let rr = [true, !hidden]
            assert.strict.deepEqual(r, rr)
        })
    }

})


describe('不寫入呼叫端之console(jsdom 31起CSS解析失敗改經virtualConsole回報, 預設會轉印至console.error)', function() {

    //擷取console各方法之呼叫, 執行fn後還原
    let spy = async (fn) => {
        let calls = []
        let orig = {}
        for (let k of ['log', 'info', 'warn', 'error', 'debug']) {
            orig[k] = console[k]
            console[k] = (...a) => {
                calls.push(k + ': ' + a.map(String).join(' ').slice(0, 120))
            }
        }
        let out
        try {
            out = await fn()
        }
        finally {
            for (let k of Object.keys(orig)) {
                console[k] = orig[k]
            }
        }
        return { out, calls }
    }

    //各種真實網頁常見而jsdom之CSS解析器可能無法解析之樣式表
    let sheets = [
        ['括號不成對、未結束之宣告', '.a{color:red;;} @media (min-width:{ ; .b{display:none} } .c{ :: } }}} @unknown foo; p{margin:'],
        ['舊IE之CSS hack', '.ie{*zoom:1;_height:1px;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#80000000\',endColorstr=\'#80000000\');width:expression(document.body.clientWidth > 800 ? "800px" : "auto")}'],
        ['現代CSS(layer/nesting/scope/property/container)', '@layer base,theme;@layer base{p{color:red}} .p{& .q{color:blue}} @scope (.s){p{color:green}} @property --x{syntax:"<length>";inherits:false;initial-value:0px} article:has(h1){outline:1px solid} @container (min-width:1px){p{margin:0}}'],
        ['@import與base64內嵌字型', '@import url("https://fonts.example.net/css?family=X"); @font-face{font-family:F;src:url(data:font/woff2;base64,AAAA) format("woff2")}'],
    ]

    for (let [name, css] of sheets) {
        it('樣式表: ' + name + ' → 不呼叫console且正文照常取出', async function() {
            let { out, calls } = await spy(() => parseArticle(page('<style>' + css + '</style>', '<article>' + ART + '</article>'), URL_PAGE, null))
            let r = [calls, out.success]
            let rr = [[], true]
            assert.strict.deepEqual(r, rr)
        })
    }

    it('style屬性內之畸形CSS亦不呼叫console', async function() {
        let body = '<article>' + paras(4) + '<div style="color:;;{ ::; display">x</div>' + paras(4, 'Q') + '</article>'
        let { out, calls } = await spy(() => parseArticle(page('', body), URL_PAGE, null))
        let r = [calls, out.success]
        let rr = [[], true]
        assert.strict.deepEqual(r, rr)
    })

})


describe('錯誤邊界與輸入形態(本函數不會reject, 回傳形狀固定)', function() {

    let isShapeOk = (t) => {
        if (t.success === true) {
            return typeof t.title === 'string' && typeof t.content === 'string' && t.contentLength === t.content.length
        }
        return t.success === false && typeof t.reason === 'string' && typeof t.message === 'string'
    }

    //html之toString拋錯: JSDOM於建構時取字串即失敗(上游傳入異常物件時)
    let mkBadHtml = () => ({
        toString: () => {
            throw new Error('boom')
        },
    })

    //每列: [說明, html, url, meta, 預期success, 預期reason(success為true時為undefined)]
    let cases = [
        ['空字串', '', URL_PAGE, null, false, 'empty-content'],
        ['僅空白', '   \n\t \r\n  ', URL_PAGE, null, false, 'empty-content'],
        ['只有script', '<script>var x=1</script>', URL_PAGE, null, false, 'empty-content'],
        ['frameset頁(無body文字)', '<html><frameset cols="50%,50%"><frame src="a.html"><frame src="b.html"></frameset></html>', URL_PAGE, null, false, 'empty-content'],
        ['BOM開頭且CRLF換行', '﻿' + page('', '<article>' + ART.replace(/\n/g, '\r\n') + '</article>'), URL_PAGE, null, true, undefined],
        ['含NUL與控制字元', page('', '<article>' + ART.replace('quick', 'qu\u0000ick') + '\u0001\u0002\u007f\u0080\u009f</article>'), URL_PAGE, null, true, undefined],
        ['含孤立代理對(lone surrogate)', page('', '<article>' + ART + '<p>lone \uD800 high and \uDC00 low surrogates plus emoji 😀 ok</p></article>'), URL_PAGE, null, true, undefined],
        ['未閉合標籤與錯配結束標籤', '<div><p>one</div></p></span><b><i>x</b></i>' + paras(8) + '</body></html></div>', URL_PAGE, null, true, undefined],
        ['table內之foster parenting', page('', '<table><p>foster paragraph one out of the table</p><tr><td>cell</td></tr>' + paras(6) + '</table>'), URL_PAGE, null, true, undefined],
        ['深層巢狀div(150層)', page('', '<div>'.repeat(150) + ART + '</div>'.repeat(150)), URL_PAGE, null, true, undefined],
        ['請求網址為空字串(JSDOM之url須為合法網址)', page('', '<article>' + ART + '</article>'), '', null, false, 'parse-error'],
        ['請求網址非合法網址', page('', '<article>' + ART + '</article>'), 'not a url', null, false, 'parse-error'],
        ['meta.finalUrl非合法網址(優先於請求網址)', page('', '<article>' + ART + '</article>'), URL_PAGE, { finalUrl: 'http://[bad' }, false, 'parse-error'],
        ['meta.finalUrl為合法網址', page('', '<article>' + ART + '</article>'), 'not a url', { finalUrl: 'https://final.example.net/a' }, true, undefined],
        ['html之toString拋錯(上游傳入異常物件)', mkBadHtml(), URL_PAGE, null, false, 'parse-error'],
    ]

    for (let [name, html, url, meta, success, reason] of cases) {
        it(name, async function() {
            let t = await parseArticle(html, url, null, meta)
            let r = [isShapeOk(t), t.success, t.reason]
            let rr = [true, success, reason]
            assert.strict.deepEqual(r, rr)
        })
    }

})


describe('title取法', function() {

    it('JSON-LD之headline優先於<title>', async function() {
        let head = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"LD Headline","author":{"@type":"Person","name":"LD Author"}}</script>'
        let t = await parseArticle(page(head, '<article>' + ART + '</article>'), URL_PAGE, null)
        let r = [t.success, t.title]
        let rr = [true, 'LD Headline']
        assert.strict.deepEqual(r, rr)
    })

    it('<title>內之換行與連續空白依HTML規範收斂為單一空白並去頭尾', async function() {
        //HTML規範: document.title之getter去除頭尾空白並將連續ASCII空白收斂為單一空白
        let html = '<html><head><title>  Spaced   Title \n | Site </title></head><body>' + ART + '</body></html>'
        let t = await parseArticle(html, URL_PAGE, null)
        let r = [t.success, t.title]
        let rr = [true, 'Spaced Title | Site']
        assert.strict.deepEqual(r, rr)
    })

})


describe('src內jsdom使用站點之接線(逐點: 每處new JSDOM皆須傳入靜音之virtualConsole)', function() {

    //站點全集由程式碼取得, 不憑記憶: 凡含 new JSDOM( 之src檔。新增站點時本測試先紅, 逼使作者決定該站點之virtualConsole
    let srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
    let sites = fs.readdirSync(srcDir).filter(f => f.endsWith('.mjs')).filter(f => /new JSDOM\(/.test(fs.readFileSync(path.join(srcDir, f), 'utf8')))

    it('站點全集為parseArticle.mjs一處(規則帳本之盤點數字)', function() {
        let r = sites
        let rr = ['parseArticle.mjs']
        assert.strict.deepEqual(r, rr)
    })

    it('各站點皆以 new VirtualConsole() 建立不轉印之virtualConsole並傳入JSDOM', function() {
        let r = sites.map(f => {
            let s = fs.readFileSync(path.join(srcDir, f), 'utf8')
            return [f, /new VirtualConsole\(\)/.test(s), /virtualConsole\s*:/.test(s), /forwardTo|sendTo/.test(s)]
        })
        let rr = sites.map(f => [f, true, true, false])
        assert.strict.deepEqual(r, rr)
    })

})
