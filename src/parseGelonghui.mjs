import { meetsMinContent } from './adapterContract.mjs'
import extractHtmlTitle from './extractHtmlTitle.mjs'


/**
 * 解析格隆匯之文章與快訊內文
 *
 * 由Nuxt SSR state中之dtbDetail(快訊)或articleDetail(文章)欄位取出content，
 * 反轉義後剝除HTML標籤與實體並壓縮空白；作為內建站台adapter之parse掛點使用
 *
 * @param {String} html 輸入網頁HTML字串
 * @param {String} url 輸入網址字串，本解析器未使用
 * @returns {Object} 回傳解析結果物件，成功時為{success:true,title,content,contentLength}，失敗時為{success:false,reason,message}
 * @example
 *
 * import { defaultAdapters } from './src/fetchWeb.mjs'
 *
 * let r = defaultAdapters[0].parse(html, 'https://www.gelonghui.com/p/123456')
 * console.log(r.success, r.title)
 * // => true '流動性溢價的真相'
 *
 */
//格隆匯(快訊與文章), 由Nuxt SSR state提取結構化資料
function parseGelonghui(html, url) {

    let fields = ['dtbDetail', 'articleDetail']
    for (let field of fields) {

        let re = new RegExp(field + ':\\{[\\s\\S]*?(?:,|\\{)content:"((?:[^"\\\\]|\\\\.)*)"')
        let match = html.match(re)
        if (!match) {
            continue
        }

        let raw = match[1]
            .replace(/\\u([0-9a-fA-F]{4})/g, (s, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')

        let content = raw.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
        let title = extractHtmlTitle(html)

        if (!meetsMinContent(content)) {
            return { success: false, reason: 'empty-content', message: 'content too short (' + content.length + ' chars)' }
        }
        return { success: true, title, content, contentLength: content.length }
    }

    return { success: false, reason: 'custom-parser-miss', message: 'gelonghui: no content found in __NUXT__ state' }
}


export default parseGelonghui
