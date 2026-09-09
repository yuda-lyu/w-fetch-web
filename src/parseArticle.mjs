import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import findAdapter from './findAdapter.mjs'
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


async function parseArticle(html, url, adapters) {

    let hit = await findAdapter(url, adapters)

    //adapter選擇過程出錯時顯性回報, 不得靜默改走Readability——
    //呼叫端註冊adapter即代表選定該解析階段, 靜默替換等於讓其經歷未選擇的處理管線階段
    if (hit.type === 'error') {
        return { success: false, reason: 'adapter-error', message: hit.message }
    }
    if (hit.type === 'hit') {
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
