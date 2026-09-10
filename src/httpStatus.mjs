//HTTP狀態碼之失敗判準：本模組為其單一擁有者
//
//此判準先前只存在於fetchWebByCurl內，於是**只有curl階看得到HTTP狀態**：
//playwright兩階與camofox階皆丟棄page.goto()回傳的Response物件，
//實測同一個回500與404的網址——curl回status:'error'/reason:'http-error'，
//playwright回status:'success'並帶回錯誤頁的HTML。
//
//後果不只是歸因不準：curl被擋而升級至playwright時，站台的404或403頁面會被當成
//抓取成功的內容送進判識與Readability。錯誤頁多半有完整版面與大量文字，
//故不會被empty攔下，呼叫端最後收到status:'success'與一篇「找不到頁面」的文章。
//
//與UA/Referer/Accept-Language在playwright階靜默失效同型（該次已修），
//此為同型的第三處。凡屬「四個抓取器都該做的事」，判準一律放在此類共用模組，
//不寫在任一抓取器內


//可重試之狀態碼判準
//5xx為伺服器端暫時性失敗、429為限流，兩者再抓一次有機會成功；
//其餘4xx為請求本身的問題，重試只是重複同一個錯誤
function _isRetryableCode(httpCode) {
    return httpCode >= 500 || httpCode === 429
}


/**
 * 依HTTP狀態碼判定是否為失敗，並給出失敗歸因與可重試性
 *
 * 四個抓取器共用同一判準，不各自實作
 *
 * @param {Integer} httpCode 輸入HTTP狀態碼整數，取不到時傳0
 * @returns {Object|null} 非失敗時回傳null；失敗時回傳{reason,message,httpCode,retryable}
 * @example
 *
 * import { checkHttpStatus } from './src/httpStatus.mjs'
 *
 * console.log(checkHttpStatus(200))
 * // => null
 *
 * console.log(checkHttpStatus(404))
 * // => { reason: 'http-error', message: 'HTTP 404', httpCode: 404, retryable: false }
 *
 * console.log(checkHttpStatus(503).retryable)
 * // => true
 *
 */
function checkHttpStatus(httpCode) {

    //取不到狀態碼時不視為失敗: playwright於同頁錨點導航等情形會回null response,
    //此時貿然判失敗會把本來抓得到的頁面擋掉。寧可放行交由後續判識處理
    if (!httpCode || httpCode < 400) {
        return null
    }

    return {
        reason: 'http-error',
        message: 'HTTP ' + httpCode,
        httpCode,
        retryable: _isRetryableCode(httpCode),
    }
}


export {
    checkHttpStatus
}
