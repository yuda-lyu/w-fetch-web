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
//  id       非空字串，供稽核與錯誤訊息使用
//  match    RegExp(以test判定)或函數(回傳truthy即命中，其回傳值作為ctx傳給parse與fetch)
//  parse    函數，簽章為(html, url, ctx)；與fetch至少須有其一
//  fetch    函數，簽章為(url, opt, ctx)；與parse至少須有其一
//  inspect  選填布林，false表**此adapter命中時**不做原始內容判識
//  fallback 選填布林，預設true；false表fetch失敗時不落回階梯
//
//── fetch掛點：三個掛點分屬管線的三個階段 ──
//  fetch    取得內容    ——「這次要不要爬」
//  inspect  內容判識    ——「這份內容能不能用」
//  parse    解析為文章  ——「怎麼從這份內容取出正文」
//三者各自獨立，可只給其中之一。呼叫端手上有官方API、內部快取、已登入session或RSS時，
//以fetch取代爬取，仍可沿用本套件的判識、重試、歸因與結果形狀
//
//── fetch之輸出契約(與四個內建抓取器同形，由fetchContract把關) ──
//  {status:'success', html}                成功；html須為非空字串
//  {status:'error', reason, message}       顯性失敗；依fallback決定續走階梯或收攤
//  {status:'skip'}                         此網址不適用；**恆**續走階梯，不受fallback拘束
//回傳形狀不合契約或拋錯 → reason='adapter-fetch-error'，不落回（與match拋錯同構：
//呼叫端程式碼的確定性錯誤，換一個抓取器不會讓它變好）
//
//'skip'獨立於fallback之理由：match只看得到網址，而「我的來源有沒有這一篇」常常要查了才知道。
//既然這是match表達不了的資訊，它就不是「失敗」而是「我不該被算進來」
//
//── fetch與opt.method之關係 ──
//opt.method非'auto'時fetch**照跑**，其後的落回對象就是method所指定的那一階。
//兩者回答的是不同問題：opt.method是「要爬的時候用哪一種爬法」，fetch是「這次要不要爬」，
//沒有衝突就不需要位階。反之若讓method='curl'跳過fetch，呼叫端會得到
//「我註冊了但完全沒反應」這種查不出來的失敗——本套件已於判識器與inspect宣告上各踩過一次
//
//── 為何inspect要能掛在adapter上(而非只有opt.inspect) ──
//通用判識會把「內嵌結構化資料但可見文字極少」的頁面判為空內容而升級，於是註冊了adapter、
//自知如何解析該站台的呼叫端，其adapter根本輪不到被呼叫(實測見test之/nextdata案例)。
//
//在此欄成立之前，唯一解法是設opt.inspect=false，但那是**整次呼叫**的開關：
//呼叫端若以同一個包裝函數處理各種網址，就得自行先判斷「這個網址是不是我有adapter的站台」
//才能決定要不要關——而那個判斷正是adapter.match已經在做的事。同一個決定被迫寫兩處，
//且兩處會分歧(呼叫端改了match卻忘了改開關，判識就悄悄擋回來)。
//
//故此欄與match放在一起：**站台知識與其判識豁免同屬一個擁有者**。
//此欄對內建adapter與使用端adapter一視同仁，無特例。
//
//語意刻意只做**關**不做開：實際生效之判識為 step.inspect && adapter.inspect !== false，
//亦即opt.inspect=false時adapter無法把它開回來。opt是呼叫端對本次呼叫的明確指示，
//位階高於站台知識；反向若允許adapter強制開啟，呼叫端就失去一個能一律關閉的總開關
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

    //parse與fetch至少須有其一: 兩者分屬管線的不同階段, 可只註冊其中之一
    if (!isfun(adapter.parse) && !isfun(adapter.fetch)) {
        return false
    }

    return true
}


/**
 * 判定命中之adapter於fetch失敗時是否落回階梯
 *
 * 只認嚴格false為「不落回」，其餘值(含未給)一律落回，使忘記宣告的後果偏保守——
 * 忘了宣告的結果是「還是抓得到內容，只是走了爬蟲」，不是「什麼都沒有」
 *
 * @param {Object|null} adapter 輸入命中之adapter物件
 * @returns {Boolean} 回傳是否落回之布林值
 * @example
 *
 * import { wantsFallback } from './src/adapterContract.mjs'
 *
 * console.log(wantsFallback(null), wantsFallback({ fallback: false }), wantsFallback({ fallback: 0 }))
 * // => true false true
 *
 */
function wantsFallback(adapter) {
    return adapter?.fallback !== false
}


/**
 * 判定命中之adapter是否要求做原始內容判識
 *
 * 只認嚴格false為「不做」，其餘值（含未給、未命中adapter）一律維持既有行為之做，
 * 使忘記標記的後果偏保守（多判識）而非偏危險（漏判識）
 *
 * @param {Object|null} adapter 輸入命中之adapter物件，未命中時為null或undefined
 * @returns {Boolean} 回傳是否做判識之布林值
 * @example
 *
 * import { wantsInspect } from './src/adapterContract.mjs'
 *
 * console.log(wantsInspect(null), wantsInspect({ inspect: false }), wantsInspect({ inspect: 0 }))
 * // => true false true
 *
 */
function wantsInspect(adapter) {
    return adapter?.inspect !== false
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
    wantsInspect,
    wantsFallback,
    meetsMinContent,
    normalizeParsed
}
