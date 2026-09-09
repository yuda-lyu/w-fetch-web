import { meetsMinContent } from './adapterContract.mjs'
import extractHtmlTitle from './extractHtmlTitle.mjs'


/**
 * 解析Bloomberg之文章內文
 *
 * 由<script id="__NEXT_DATA__">取出props.pageProps.story.body.content區塊陣列，
 * 跳過廣告與媒體等非內文型別後，遞迴取出各區塊之文字並以兩換行相接；
 * 作為內建站台adapter之parse掛點使用
 *
 * @param {String} html 輸入網頁HTML字串
 * @param {String} url 輸入網址字串，本解析器未使用
 * @returns {Object} 回傳解析結果物件，成功時為{success:true,title,content,contentLength}，失敗時為{success:false,reason,message}
 * @example
 *
 * import { defaultAdapters } from './src/fetchWeb.mjs'
 *
 * let r = defaultAdapters[1].parse(html, 'https://www.bloomberg.com/news/articles/2026-01-01/abc')
 * console.log(r.success, r.contentLength)
 * // => true 58
 *
 */
//Bloomberg, 由__NEXT_DATA__提取story.body.content
function parseBloomberg(html, url) {

    let m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/)
    if (!m) {
        return { success: false, reason: 'custom-parser-miss', message: 'bloomberg: no __NEXT_DATA__' }
    }

    let data
    try {
        data = JSON.parse(m[1])
    }
    catch {
        return { success: false, reason: 'custom-parser-miss', message: 'bloomberg: __NEXT_DATA__ JSON parse failed' }
    }

    let story = data?.props?.pageProps?.story
    let blocks = story?.body?.content
    if (!Array.isArray(blocks) || blocks.length === 0) {
        return { success: false, reason: 'custom-parser-miss', message: 'bloomberg: no story.body.content' }
    }

    let SKIP = new Set(['ad', 'inline-newsletter', 'inline-recirc', 'media', 'image', 'video', 'blockquote-instagram'])
    let nodeText = (n) => {
        if (n === null || typeof n !== 'object') {
            return ''
        }
        let t = typeof n.value === 'string' ? n.value : ''
        if (Array.isArray(n.content)) {
            t += n.content.map(nodeText).join('')
        }
        return t
    }

    let paragraphs = []
    for (let block of blocks) {
        if (SKIP.has(block?.type)) {
            continue
        }
        let t = nodeText(block).replace(/\s+/g, ' ').trim()
        if (t.length > 0) {
            paragraphs.push(t)
        }
    }

    let content = paragraphs.join('\n\n')
    let title = (typeof story.headline === 'string' ? story.headline : extractHtmlTitle(html)).trim()

    if (!meetsMinContent(content)) {
        return { success: false, reason: 'empty-content', message: 'bloomberg: content too short (' + content.length + ' chars)' }
    }
    return { success: true, title, content, contentLength: content.length }
}


export default parseBloomberg
