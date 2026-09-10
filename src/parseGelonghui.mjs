import { meetsMinContent } from './adapterContract.mjs'
import extractHtmlTitle from './extractHtmlTitle.mjs'


//由Nuxt state字串中切出指定欄位之物件片段, 以大括號配對決定其邊界
//
//先前以單一regex「field:\{[\s\S]*?(?:,|\{)content:"..."」直接找content, 其惰性比對
//會跨越物件邊界: 當content是該物件的首個鍵時, 開頭的左大括號已被 :\{ 消耗,
//比對遂延伸到後面另一個欄位而抓到別人的內文, 且靜默成功不報錯。
//
//不能改以「中間不得含大括號」收緊: 真實state內含巢狀物件(實測articleDetail含
//tag:{name:"原创",color:"#999999"}), 那樣會直接找不到content。
//故改為先切出物件範圍再於範圍內尋找——邊界由配對決定, 與鍵的順序無關
function _sliceObject(html, field) {

    let key = field + ':{'
    let i = html.indexOf(key)
    if (i < 0) {
        return null
    }

    //自左大括號起掃描, 字串內之大括號與跳脫字元不計入配對
    let start = i + key.length - 1
    let depth = 0
    let inStr = false
    let esc = false
    for (let k = start; k < html.length; k++) {
        let c = html[k]
        if (esc) {
            esc = false
            continue
        }
        if (c === '\\') {
            esc = true
            continue
        }
        if (inStr) {
            if (c === '"') {
                inStr = false
            }
            continue
        }
        if (c === '"') {
            inStr = true
            continue
        }
        if (c === '{') {
            depth += 1
        }
        else if (c === '}') {
            depth -= 1
            if (depth === 0) {
                return html.slice(start, k + 1)
            }
        }
    }

    //大括號未配對完成, 視為找不到
    return null
}


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

        //先以大括號配對切出該欄位之物件, 再於其內找content, 使比對不會跨到別的欄位
        let seg = _sliceObject(html, field)
        if (seg === null) {
            continue
        }

        let match = seg.match(/(?:^\{|,)content:"((?:[^"\\]|\\.)*)"/)
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

    return { success: false, reason: 'adapter-parse-miss', message: 'gelonghui: no content found in __NUXT__ state' }
}


export default parseGelonghui
