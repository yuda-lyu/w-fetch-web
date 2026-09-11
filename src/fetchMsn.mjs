import isestr from 'wsemi/src/isestr.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import fetchWebByCurl from './fetchWebByCurl.mjs'
import fetcherOf from './fetcherSeam.mjs'


//MSN 內建 adapter：網址比對與 fetch 掛點
//
//── 為何需要 fetch 掛點而非 parse ──
//msn.com 之文章頁為純前端渲染, 本套件四階實測全數失敗(2026-09-11, 真實文章頁):
//  curl                 42708 bytes 殼頁, title="MSN", visible=0  → empty
//  playwright-headless  57031 bytes, visible=21                    → empty
//  playwright-headed    56605 bytes, visible=21                    → empty
//  camofox              snapshot 0 字                              → camofox-empty
//整條階梯耗時 43 秒而成功率為 0。問題不在解析, 是頁面裡根本沒有正文——故只能改從內容 API 取得。
//
//── 內容 API ──
//  GET https://assets.msn.com/content/view/v2/Detail/{locale}/{id}
//回 JSON, 含 title、body(HTML)、type、provider、sourceHref 等欄(2026-09-11 實抓 12 篇皆 type='article')。
//實測: locale 為任一合法值皆可取得同一篇(zh-tw 之文章以 en-us 查亦回同一份); 不合法 locale 回 400;
//不存在之 id 回 410。本模組取網址中之 locale 以求與原站一致。
//
//── 為何回傳重組之 HTML 而非直接回傳文章 ──
//fetch 掛點之輸出契約與四個抓取器同形({status, html}), 取得後照常走判識與解析——
//實測 12 篇重組後之 HTML 經 inspectHtml 皆通過、經 Readability 皆解析成功, 故本 adapter 不需要 parse 掛點,
//呼叫端亦可另以自己的 parse 覆寫。contentKind 標為 synthesized: 這份 HTML 由 JSON 組出, 不是站方原始文件,
//判識器據此只比對 semantic 類判準


//API 端點。host 寫死, 路徑中之 locale 與 id 皆經下方比對規則限定字元集, 無法注入任意網址
let API_BASE = 'https://assets.msn.com/content/view/v2/Detail/'


//文章頁網址之比對規則
//
//形如 https://www.msn.com/zh-tw/news/other/<slug>/ar-AA2bZm9d
//  locale  取路徑首段, 限 xx-yy 形
//  id      取 ar- 之後之英數字; 'ar-' 為文章型, 影片(vi-)與圖集(ss-)之內容形狀不同, 不在本 adapter 範圍
//子網域寬度與 routeByUrl 對 msn 之寫法一致((?:www\.)?), 理由見該檔檔頭
let ARTICLE_RE = /^https?:\/\/(?:www\.)?msn\.com\/([a-z]{2}-[a-z]{2})\/(?:[^?#]*\/)?ar-([A-Za-z0-9]+)(?:[?#]|$)/i


/**
 * 比對 msn 文章頁網址並取出 locale 與文章 id
 *
 * 作為內建 msn adapter 之 match 掛點。回傳之物件即為 ctx，傳入 fetch 掛點
 *
 * @param {String} url 輸入網址字串
 * @returns {Object|null} 命中時回傳{locale,id}，未命中時回傳null
 * @example
 *
 * import { matchMsn } from './src/fetchMsn.mjs'
 *
 * console.log(matchMsn('https://www.msn.com/zh-tw/news/other/abc/ar-AA2bZm9d'))
 * // => { locale: 'zh-tw', id: 'AA2bZm9d' }
 *
 * console.log(matchMsn('https://www.msn.com/zh-tw/news'))
 * // => null
 *
 */
function matchMsn(url) {
    if (!isestr(url)) {
        return null
    }
    let m = url.match(ARTICLE_RE)
    if (!m) {
        return null
    }
    return { locale: m[1].toLowerCase(), id: m[2] }
}


//HTML 轉義, 供標題放入重組之文件
function _esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}


//內容 API 回應形狀不合預期時之失敗結果
function _miss(message) {
    return { status: 'error', reason: 'adapter-fetch-miss', message: 'msn: ' + message }
}


/**
 * 經 msn 內容 API 取得文章，重組為 HTML 文件
 *
 * 作為內建 msn adapter 之 fetch 掛點。API 之請求走本套件之 curl 抓取器，
 * 故 User-Agent、重試與 HTTP 狀態判準與其餘抓取一致；opt 原樣轉傳，並沿用 opt._fetchers.curl 測試接縫
 *
 * @param {String} url 輸入文章頁網址字串，本函數僅用於訊息
 * @param {Object} opt 輸入設定物件，轉傳給 curl 抓取器
 * @param {Object} ctx 輸入 matchMsn 之回傳物件{locale,id}
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，成功時為{status:'success',html,contentKind:'synthesized'}，失敗時為{status:'error',reason,message}，本函數不會reject
 * @example
 *
 * import { matchMsn, fetchMsn } from './src/fetchMsn.mjs'
 *
 * let test = async () => {
 *     let url = 'https://www.msn.com/zh-tw/news/other/abc/ar-AA2bZm9d'
 *     let r = await fetchMsn(url, {}, matchMsn(url))
 *     console.log(r.status, r.contentKind)
 *     // => 'success' 'synthesized'
 * }
 * await test()
 *     .catch((err) => {
 *         console.log(err)
 *     })
 *
 */
async function fetchMsn(url, opt, ctx) {

    if (!isobj(ctx) || !isestr(ctx.locale) || !isestr(ctx.id)) {
        return _miss('no article id in url')
    }

    //真實curl抓取器不會reject, 但本函數經測試接縫可接到任意函數;
    //上層runFetchSafely雖會攔下, 本函數自身之「不會reject」仍須成立, 不依賴呼叫者代為兜底
    let curl = fetcherOf(opt, 'curl', fetchWebByCurl)
    let r
    try {
        r = await curl(API_BASE + ctx.locale + '/' + ctx.id, opt)
    }
    catch (err) {
        return { status: 'error', reason: 'fetcher-error', message: 'msn api: ' + (err?.message || String(err)) }
    }

    //抓取失敗(含 410 文章不存在、400 等)原樣帶回其歸因, 不改寫——那是抓取層已登記之值域
    if (r?.status !== 'success') {
        return { status: 'error', reason: r?.reason || 'unknown', message: 'msn api: ' + (r?.message || 'request failed') }
    }

    let data
    try {
        data = JSON.parse(r.html)
    }
    catch {
        return _miss('api response is not JSON')
    }

    if (!isobj(data)) {
        return _miss('api response is not an object')
    }
    if (data.type !== 'article') {
        return _miss('content type is ' + JSON.stringify(data.type) + ', not article')
    }
    if (!isestr(data.body)) {
        return _miss('article has no body')
    }

    let title = isestr(data.title) ? data.title : ''
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + _esc(title) + '</title></head>' +
        '<body><article><h1>' + _esc(title) + '</h1>' + data.body + '</article></body></html>'

    return { status: 'success', html, contentKind: 'synthesized' }
}


export {
    matchMsn,
    fetchMsn
}
