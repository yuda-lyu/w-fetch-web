import isestr from 'wsemi/src/isestr.mjs'
import { fetchedAtLocal } from './fetchedAt.mjs'


/**
 * 把抓取函數之對外結果轉為內部流程用之結構
 *
 * 四個fetchWebByXxx回傳{status:'success'|'error',...}，而執行計畫內部以{success:Boolean,...}判斷，
 * 由本函數轉換以隔離兩者
 *
 * @param {Object} r 輸入抓取函數之結果物件
 * @returns {Object} 回傳內部結構物件，成功時為{success:true,html,method,snapshot,contentKind}，失敗時為{success:false,method,reason,message}
 * @example
 *
 * import { adapt } from './src/finalizeResult.mjs'
 *
 * console.log(adapt({ status: 'success', html: '<p>a</p>', method: 'curl' }))
 * // => { success: true, html: '<p>a</p>', method: 'curl', snapshot: undefined, contentKind: undefined }
 *
 */
function adapt(r) {
    if (r.status === 'success') {

        //contentKind與finalUrl皆須列入白名單, 否則會於此被靜默丟棄——
        //前者使runPlan無從得知該內容是否為合成物, 後者使呼叫端與解析器無從得知內容實際來自哪裡
        return { success: true, html: r.html, method: r.method, snapshot: r.snapshot, contentKind: r.contentKind, finalUrl: r.finalUrl }
    }
    return { success: false, method: r.method, reason: r.reason || 'unknown', message: r.message }
}


/**
 * 由抓取失敗之內部結構彙整為一筆attempt
 *
 * @param {Object} r 輸入內部結構之失敗結果物件
 * @returns {Object} 回傳{status:'failed',reason,message}物件
 * @example
 *
 * import { summarizeFail } from './src/finalizeResult.mjs'
 *
 * console.log(summarizeFail({ success: false, reason: 'http-error', message: 'HTTP 500' }))
 * // => { status: 'failed', reason: 'http-error', message: 'HTTP 500' }
 *
 */
function summarizeFail(r) {
    return { status: 'failed', reason: r.reason, message: r.message }
}


/**
 * 彙整fetchWeb之最終回傳結果
 *
 * 成功且已解析時輸出title與content，成功但未解析時輸出html；
 * 失敗時輸出message，並於有失敗歸因時附上reason
 *
 * @param {String} url 輸入網址字串
 * @param {Object} result 輸入內部結構之結果物件
 * @param {Array} attempts 輸入各階嘗試紀錄陣列
 * @returns {Object} 回傳對外之結果物件
 * @example
 *
 * import { finalize } from './src/finalizeResult.mjs'
 *
 * console.log(finalize('https://a.com/', { success: false, reason: 'empty-content', message: 'too short' }, []))
 * // => { status: 'error', url: 'https://a.com/', message: 'too short', fetchedAt: '2026-09-09 16:00:00', attempts: [], reason: 'empty-content' }
 *
 */
function finalize(url, result, attempts) {

    if (result.success) {
        let out = { status: 'success', url, method: result.method, fetchedAt: fetchedAtLocal(), attempts }
        if (result.html !== undefined) {
            out.html = result.html
        }
        else {
            out.title = result.title
            out.content = result.content
            out.contentLength = result.contentLength
        }
        if (result.snapshot) {
            out.snapshot = result.snapshot
        }

        //內容由adapter之fetch掛點取得時另帶其id: method只說得出「來自某個adapter」,
        //說不出是哪一個, 而呼叫端可能同時註冊多個。未經該掛點者不輸出此欄, 維持既有形狀
        if (isestr(result.adapterId)) {
            out.adapterId = result.adapterId
        }

        //內容實際來源之網址
        //
        //`url` 是**本套件最後實際發出請求的網址**（含轉址參數提取後之目標），
        //`finalUrl` 是**這份內容實際來自哪裡**（跟隨HTTP轉址或JS轉址之後）。
        //一句話分辨: url是我要了什麼, finalUrl是我拿到了什麼。
        //
        //兩者為何必須分開: 呼叫端(尤其知識庫類)以url對回自己送出的網址、當主鍵,
        //把url改成最終值會拿走那個能力; 而不給finalUrl則使「內容其實來自別站」無從察覺——
        //實測adapter曾收到「A站的網址配B站的內容」。取不到時省略該欄而非給假值
        if (isestr(result.finalUrl) && result.finalUrl !== url) {
            out.finalUrl = result.finalUrl
        }
        return out
    }

    //reason為失敗歸因, 供呼叫端辨識「adapter程式錯誤」與「頁面真的沒內容」等不同情形,
    //以決定要重試、告警或修adapter; 無reason時不輸出該欄, 維持既有形狀
    let out = {
        status: 'error',
        url,
        message: result.message || 'all methods failed',
        fetchedAt: fetchedAtLocal(),
        attempts,
    }
    if (isestr(result.reason)) {
        out.reason = result.reason
    }
    return out
}


export {
    adapt,
    summarizeFail,
    finalize
}
