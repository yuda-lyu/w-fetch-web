import isestr from 'wsemi/src/isestr.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import { MIN_CONTENT } from './constants.mjs'


//站台adapter之契約：本模組為其唯一事實來源
//
//adapter供使用端覆寫特定站台之內容解析方式，形狀為{id,match,parse}。
//在本模組成立之前，這份契約同時存在於三個地方各說一次(findAdapter之JSDoc、fetchWeb之
//opt.adapters JSDoc、parseArticle之實作)，任一處修改都不會讓另外兩處失效，
//故文件、範例、測試三者只能各自從實作反推。凡契約有變，只改本模組。
//
//── 輸入契約(由isValidAdapter把關，不合法者略過而非拋錯) ──
//  id     非空字串，供稽核與錯誤訊息使用
//  match  RegExp(以test判定)或函數(回傳truthy即命中，其回傳值作為ctx傳給parse)
//  parse  函數，簽章為(html, url, ctx)
//
//── 輸出契約(由normalizeParsed把關) ──
//  success      **須為嚴格布林**，不以truthiness判定，否則'false'等字串會被當成功
//  成功時 title 非字串一律取空字串
//  成功時 content 須達MIN_CONTENT字元，與Readability路徑同一標準(見meetsMinContent)
//  contentLength 一律由content計算，不採信adapter自述值
//  失敗時 reason/message 保留adapter自述值，供呼叫端辨識「adapter程式錯誤」與「頁面真的沒內容」
//  回傳之其餘欄位(含html、method、snapshot)一律不採用——它們會使finalize改走原始HTML分支，
//  讓呼叫端取不到正文，故成功結果只投影為白名單四欄
//
//── 錯誤邊界 ──
//  parse拋錯或async reject → reason='parse-error'，不使fetchWeb reject
//  match拋錯 → reason='adapter-error'，**顯性回報而不靜默改用預設解析器**
//    (由findAdapter負責；靜默回退會讓呼叫端出現非預期的處理管線階段)


/**
 * 檢核adapter條目是否符合輸入契約
 *
 * @param {*} adapter 輸入待檢核之adapter
 * @returns {Boolean} 回傳是否合法之布林值
 * @example
 *
 * import { isValidAdapter } from './src/adapterContract.mjs'
 *
 * console.log(isValidAdapter({ id: 'a', match: /x/, parse: () => ({}) }), isValidAdapter({ id: 'a', match: 'x', parse: () => ({}) }))
 * // => true false
 *
 */
function isValidAdapter(adapter) {

    if (!isobj(adapter)) {
        return false
    }

    //id為稽核與錯誤訊息來源, 不可省
    if (!isestr(adapter.id)) {
        return false
    }

    //match須為RegExp或函數
    let match = adapter.match
    if (!(match instanceof RegExp) && !isfun(match)) {
        return false
    }

    //本版僅支援parse掛點, 未來新增fetch掛點時此條件改為「parse或fetch任一」
    if (!isfun(adapter.parse)) {
        return false
    }

    return true
}


/**
 * 判定正文長度是否達最低門檻
 *
 * adapter路徑與Readability路徑刻意採同一標準，故兩處皆呼叫本函數而非各自比較，
 * 避免同一規則手寫兩處而日後分歧
 *
 * @param {String} content 輸入正文字串
 * @returns {Boolean} 回傳是否達門檻之布林值
 * @example
 *
 * import { meetsMinContent } from './src/adapterContract.mjs'
 *
 * console.log(meetsMinContent('x'.repeat(50)), meetsMinContent('x'.repeat(49)))
 * // => true false
 *
 */
function meetsMinContent(content) {
    return String(content).length >= MIN_CONTENT
}


/**
 * 把adapter之parse回傳值檢核並投影為固定形狀
 *
 * @param {*} parsed 輸入adapter.parse之回傳值
 * @param {String} pre 輸入錯誤訊息前綴字串
 * @returns {Object} 回傳內部結構結果物件，成功時為{success:true,title,content,contentLength}，失敗時為{success:false,reason,message}
 * @example
 *
 * import { normalizeParsed } from './src/adapterContract.mjs'
 *
 * console.log(normalizeParsed({ success: 'true', content: 'x' }, 'adapter a '))
 * // => { success: false, reason: 'parse-error', message: 'adapter a returned non-boolean success' }
 *
 */
function normalizeParsed(parsed, pre) {

    if (!isobj(parsed)) {
        return { success: false, reason: 'parse-error', message: pre + 'returned invalid result' }
    }

    //success須為嚴格布林, 不以truthiness判定, 否則'false'等字串會被當成功
    if (!isbol(parsed.success)) {
        return { success: false, reason: 'parse-error', message: pre + 'returned non-boolean success' }
    }

    //失敗時保留adapter自述之reason與message供呼叫端辨識, 不可壓成通用空內容
    if (!parsed.success) {
        return {
            success: false,
            reason: isestr(parsed.reason) ? parsed.reason : 'adapter-parse-failed',
            message: isestr(parsed.message) ? parsed.message : pre + 'parse failed',
        }
    }

    //內容須通過與Readability路徑相同之最低字數門檻, 否則adapter可回傳空內容卻標記為成功,
    //使呼叫端取得status:'success'但無正文
    let content = isestr(parsed.content) ? parsed.content : ''
    if (!meetsMinContent(content)) {
        return { success: false, reason: 'empty-content', message: pre + 'content too short (' + content.length + ' chars)' }
    }

    //投影為白名單, 且contentLength一律由content計算
    return {
        success: true,
        title: isestr(parsed.title) ? parsed.title : '',
        content,
        contentLength: content.length,
    }
}


export {
    isValidAdapter,
    meetsMinContent,
    normalizeParsed
}
