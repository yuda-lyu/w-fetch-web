import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import isfun from 'wsemi/src/isfun.mjs'
import { meetsMinContent, normalizeParsed } from './adapterContract.mjs'


//呼叫adapter之parse, 攔下拋錯與非法回傳, 並把成功結果投影為固定形狀
//adapter.parse來自使用端, 其拋錯不得破壞fetchWeb「不會reject」之契約;
//await可同時涵蓋同步拋錯與async reject, 避免async adapter產生unhandledRejection
async function _parseByAdapter(adapter, ctx, html, url) {

    let pre = 'adapter ' + adapter.id + ' '

    let parsed
    try {
        parsed = await adapter.parse(html, url, ctx)
    }
    catch (err) {
        return { success: false, reason: 'parse-error', message: pre + 'parse error: ' + (err?.message || String(err)) }
    }

    //檢核與投影一律交由契約模組, 使adapter之輸出契約只有一處實作
    return normalizeParsed(parsed, pre)
}


/**
 * 依已解析之adapter命中結果解析文章，未命中者走Readability
 *
 * adapter之挑選（findAdapter）刻意不在本函數內：它只取決於網址，與抓回之HTML無關，
 * 故由runPlan於計畫執行前解析一次後傳入，詳見runPlan之_resolveAdapter
 *
 * @param {String} html 輸入網頁HTML字串
 * @param {String} url 輸入網址字串
 * @param {Object|null} hit 輸入findAdapter之結果物件，null視為未命中
 * @returns {Promise} 回傳Promise，resolve回傳解析結果物件，本函數不會reject
 */
async function parseArticle(html, url, hit) {

    //須同時確認該adapter確實有parse掛點: 三個掛點各自獨立, 只註冊fetch而不註冊parse是合法的
    //(見adapterContract之輸入契約), 此時解析仍走Readability。
    //少了這個判斷, 只有fetch的adapter會在此以「adapter.parse is not a function」失敗
    if (hit?.type === 'hit' && isfun(hit.adapter?.parse)) {
        return _parseByAdapter(hit.adapter, hit.ctx, html, url)
    }

    let article
    try {
        let doc = new JSDOM(html, { url })
        article = new Readability(doc.window.document).parse()
    }
    catch (err) {

        //JSDOM與Readability對畸形HTML或異常輸入可能throw, 攔下改回傳解析失敗,
        //讓上層走「視為empty繼續升級, 或回error結果」, 不讓整支程式crash
        return { success: false, reason: 'parse-error', message: 'parse error: ' + (err?.message || String(err)) }
    }

    let content = article?.textContent?.trim() || ''
    let title = article?.title?.trim() || ''

    if (!meetsMinContent(content)) {
        return {
            success: false,
            reason: 'empty-content',
            message: 'content too short (' + content.length + ' chars)',
        }
    }

    return { success: true, title, content, contentLength: content.length }
}


export default parseArticle
