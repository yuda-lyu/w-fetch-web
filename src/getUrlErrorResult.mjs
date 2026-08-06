import isestr from 'wsemi/src/isestr.mjs'
import isValidUrl from './isValidUrl.mjs'


/**
 * 檢核網址並取得錯誤結果物件
 *
 * 供各抓取函數於入口統一檢核網址，網址有效時回傳null代表可繼續執行
 *
 * @param {String} url 輸入待檢核網址字串
 * @param {String} method 輸入抓取方法名稱字串，將寫入結果物件之method欄位
 * @param {String} fetchedAt 輸入抓取時間字串，將寫入結果物件之fetchedAt欄位
 * @returns {Object|null} 網址無效時回傳錯誤結果物件{status:'error',url,message,reason:'invalid-url',method,fetchedAt,attempts:0}，網址有效時回傳null
 * @example
 *
 * import getUrlErrorResult from './src/getUrlErrorResult.mjs'
 *
 * console.log(getUrlErrorResult('https://a.com/', 'curl', 'now'))
 * // => null
 *
 * console.log(getUrlErrorResult('abc', 'curl', 'now'))
 * // => { status: 'error', url: 'abc', message: 'invalid url (must be http/https)', reason: 'invalid-url', method: 'curl', fetchedAt: 'now', attempts: 0 }
 *
 */
function getUrlErrorResult(url, method, fetchedAt) {

    if (!isestr(url)) {
        return { status: 'error', url: String(url), message: 'url is required (string)', reason: 'invalid-url', method, fetchedAt, attempts: 0 }
    }

    if (!isValidUrl(url)) {
        return { status: 'error', url, message: 'invalid url (must be http/https)', reason: 'invalid-url', method, fetchedAt, attempts: 0 }
    }

    return null
}


export default getUrlErrorResult
