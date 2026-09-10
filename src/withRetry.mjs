import delay from 'wsemi/src/delay.mjs'
import getRetryWaitMs from './getRetryWaitMs.mjs'


/**
 * 以線性退避重試單次嘗試函數，直到成功或次數用盡
 *
 * 三個抓取器的重試骨架原本各寫一份（含退避訊息共四處），本函數為其唯一實作。
 *
 * 單次嘗試函數回傳`{ok:true,...}`表示成功，回傳`{ok:false,...}`表示失敗；
 * 失敗時以`retryable:false`表示該錯誤不應重試（如HTTP 4xx、內容過短），
 * 未指定則視為可重試。抓取器自身的欄位（httpCode、html等）原樣帶回，本函數不解讀
 *
 * @param {Function} attemptFn 輸入單次嘗試async函數，簽章為(attempt)，回傳{ok,retryable,message,...}
 * @param {Object} cfg 輸入設定物件
 * @param {Integer} cfg.maxRetries 輸入最大重試次數整數，含初始共執行maxRetries+1次
 * @param {String} cfg.tag 輸入退避訊息之來源標籤字串
 * @param {Boolean} [cfg.showLog=true] 輸入是否輸出退避訊息布林值，預設true
 * @returns {Promise} 回傳Promise，resolve回傳單次嘗試函數之最後結果並附加attempts實際執行次數
 * @example
 *
 * import withRetry from './src/withRetry.mjs'
 *
 * let test = async () => {
 *
 *     let n = 0
 *     let r = await withRetry(async () => {
 *         n += 1
 *         return n < 2 ? { ok: false, message: 'boom' } : { ok: true, value: n }
 *     }, { maxRetries: 3, tag: 'demo' })
 *     console.log(r.ok, r.value, r.attempts)
 *     // => true 2 2
 *
 * }
 * await test()
 *     .catch((err) => {
 *         console.log(err)
 *     })
 *
 */
async function withRetry(attemptFn, cfg) {

    let maxRetries = cfg.maxRetries
    let tag = cfg.tag
    let showLog = cfg.showLog !== false

    let r = null
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {

        r = await attemptFn(attempt)

        if (r.ok) {
            return { ...r, attempts: attempt }
        }

        //不可重試之錯誤, 或次數已用盡: 直接回最後結果
        if (r.retryable === false || attempt > maxRetries) {
            return { ...r, attempts: attempt }
        }

        //退避訊息之唯一實作處; detail由抓取器提供, 未給時取其錯誤訊息
        let ms = getRetryWaitMs(attempt)
        if (showLog) {
            let detail = r.logDetail || ('error: ' + (r.message || 'unknown'))
            process.stderr.write(`[${tag}] ${detail}，等 ${ms}ms 後重試 (${attempt}/${maxRetries})\n`)
        }
        await delay(ms)
    }

    //maxRetries由getOptP0Int保證為非負整數, 故迴圈必於內部回傳; 此行為型別完整性之防線
    return { ...r, attempts: maxRetries + 1 }
}


export default withRetry
