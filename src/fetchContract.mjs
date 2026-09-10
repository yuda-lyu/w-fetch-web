import isestr from 'wsemi/src/isestr.mjs'
import isobj from 'wsemi/src/isobj.mjs'


//抓取端之契約：本模組為其唯一事實來源
//
//對稱性補完：本套件原有兩個使用端擴充點各自有完整的檢核與錯誤邊界——
//adapter之parse由adapterContract把關、判識器由detectorContract把關——
//**抓取這一端卻沒有**。四個內建抓取器不拋錯故不出事，但：
//  一、opt._fetchers是文件化的測試接縫，接的就是呼叫端寫的函數
//  二、adapter之fetch掛點接上後，抓取器就是呼叫端程式碼
//
//實測三條路徑（改動前）：
//  抓取器拋錯      → fetchWeb **reject**，違反其JSDoc明載之「本函數不會reject」
//  抓取器reject    → 同上
//  回傳非物件      → status:'error' reason:'unknown'，歸因不實（它不是「無上游歸因」，是壞掉）
//
//依全域§8第四類契約缺陷（有A→B無B→A：兩個擴充點有邊界，第三個沒有），不需已被觀察即應修
//
//── 抓取器之輸出契約 ──
//  status    'success'或'error'
//  成功時 html 須為非空字串（否則後續判識與解析拿到的不是HTML）
//  失敗時 reason/message 保留其自述值
//  其餘欄位（method、snapshot、contentKind）由既有之adapt投影，本模組不重複處置
//
//── 錯誤邊界 ──
//  拋錯、reject、回傳非物件、成功卻無html → 一律轉為結構化失敗結果，絕不外洩為reject


/**
 * 檢核抓取器之回傳值是否符合輸出契約
 *
 * 不合契約者轉為結構化失敗結果而非拋錯，使fetchWeb之「不會reject」契約於任何抓取器實作下皆成立
 *
 * @param {*} r 輸入抓取器之回傳值
 * @param {String} reason 輸入不合契約時採用之失敗歸因字串
 * @param {String} pre 輸入錯誤訊息前綴字串
 * @returns {Object|null} 合契約時回傳null，不合時回傳{status:'error',reason,message}
 * @example
 *
 * import { checkFetched } from './src/fetchContract.mjs'
 *
 * console.log(checkFetched({ status: 'success', html: '<p>a</p>' }, 'fetcher-error', 'curl '))
 * // => null
 *
 * console.log(checkFetched('oops', 'fetcher-error', 'curl '))
 * // => { status: 'error', reason: 'fetcher-error', message: 'curl returned invalid result' }
 *
 */
function checkFetched(r, reason, pre) {

    if (!isobj(r)) {
        return { status: 'error', reason, message: pre + 'returned invalid result' }
    }

    //僅檢核自稱成功者: 自稱失敗時其形狀由既有之summarizeFail處置
    if (r.status !== 'success') {
        return null
    }

    if (!isestr(r.html)) {
        return { status: 'error', reason, message: pre + 'returned success without html string' }
    }

    return null
}


/**
 * 以錯誤邊界執行抓取函數，確保其拋錯或reject不外洩
 *
 * @param {Function} fn 輸入抓取async函數
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} opt 輸入轉傳給抓取函數之設定物件
 * @param {String} reason 輸入失敗時採用之歸因字串
 * @param {String} pre 輸入錯誤訊息前綴字串
 * @returns {Promise} 回傳Promise，resolve回傳抓取器之結果物件或結構化失敗結果，本函數不會reject
 */
async function runFetchSafely(fn, url, opt, reason, pre) {

    let r
    try {
        r = await fn(url, opt)
    }
    catch (err) {

        //await同時涵蓋同步拋錯與async reject
        return { status: 'error', reason, message: pre + 'error: ' + (err?.message || String(err)) }
    }

    return checkFetched(r, reason, pre) || r
}


export {
    checkFetched,
    runFetchSafely
}
