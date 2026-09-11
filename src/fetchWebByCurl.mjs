import { execFile } from 'child_process'
import { promisify } from 'util'
import getUrlErrorResult from './getUrlErrorResult.mjs'
import { fetchedAtIso } from './fetchedAt.mjs'
import { DEFAULT_MAX_RETRIES } from './getRetryWaitMs.mjs'
import withRetry from './withRetry.mjs'
import { getOptPInt, getOptP0Int } from './getOpt.mjs'
import { getCurlIdentity } from './requestIdentity.mjs'
import { METHOD_CURL as METHOD } from './constants.mjs'
import { checkHttpStatus } from './httpStatus.mjs'


//預設值
let DEFAULT_TIMEOUT_MS = 15000
let MIN_HTML_LENGTH = 100


//採非同步execFile, 不可用execFileSync, 否則抓取期間會阻塞整個node event loop
let execFilePm = promisify(execFile)


/**
 * 使用系統curl抓取網頁原始HTML
 *
 * 特點：
 * 純curl抓取直接回傳原始HTML字串不解析；
 * HTTP 5xx與429及curl錯誤會自動重試(線性退避3至15秒)，HTTP 4xx(429除外)則不重試；
 * 網址由execFile以參數陣列傳遞，無命令注入風險，且採非同步執行不阻塞node event loop
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.timeoutMs=15000] 輸入curl最長等待毫秒整數，預設15000
 * @param {Integer} [opt.maxRetries=5] 輸入失敗時最大重試次數整數，含初始共執行maxRetries+1次，預設5
 * @param {String} [opt.userAgent] 輸入自訂User-Agent字串，未給時採requestIdentity.mjs之DEFAULT_UA（偽裝為Chrome，否則curl會送出自己的UA而被擋）
 * @param {String} [opt.referer] 輸入自訂Referer字串，未給時採requestIdentity.mjs之DEFAULT_REFERER
 * @param {String} [opt.acceptLanguage] 輸入自訂Accept-Language字串，未給時採requestIdentity.mjs之DEFAULT_ACCEPT_LANG
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，成功時為{status:'success',url,html,htmlLength,httpCode,contentKind,method,fetchedAt,attempts}（contentKind恆為'raw'），失敗時為{status:'error',url,message,reason,httpCode,method,fetchedAt,attempts}，本函數不會reject
 * @example
 *
 * import fetchWebByCurl from './src/fetchWebByCurl.mjs'
 *
 * let test = async () => {
 *
 *     let r = await fetchWebByCurl('https://example.com/')
 *     console.log(r.status, r.httpCode, r.htmlLength)
 *     // => 'success' 200 559
 *
 *     let re = await fetchWebByCurl('abc')
 *     console.log(re.status, re.reason)
 *     // => 'error' 'invalid-url'
 *
 * }
 * await test()
 *     .catch((err) => {
 *         console.log(err)
 *     })
 *
 */
async function fetchWebByCurl(url, opt = {}) {

    //fetchedAt
    let fetchedAt = fetchedAtIso()

    //check url
    let rErr = getUrlErrorResult(url, METHOD, fetchedAt)
    if (rErr) {
        return rErr
    }

    //timeoutMs
    let timeoutMs = getOptPInt(opt, 'timeoutMs', DEFAULT_TIMEOUT_MS)

    //maxRetries
    let maxRetries = getOptP0Int(opt, 'maxRetries', DEFAULT_MAX_RETRIES)

    //HTTP請求身分, 未指定者採預設; 預設值與瀏覽器階之處置理由見requestIdentity.mjs
    let { userAgent: ua, referer, acceptLanguage: acceptLang } = getCurlIdentity(opt)

    //curl拋錯時取不到狀態碼, 以前一次成功解析到者回報, 供呼叫端辨識是連線失敗或站方回應異常
    let lastHttpCode = 0

    //單次嘗試: 只判斷這一次的結果, 重試與退避交由withRetry
    let attemptOnce = async () => {
        try {

            //curl, url由參數陣列傳遞無命令注入風險
            let { stdout: raw } = await execFilePm(
                'curl',
                [
                    '-s', '-L', '--compressed',
                    '--max-time', String(Math.ceil(timeoutMs / 1000)),
                    //末兩行依序為http_code與url_effective
                    //url_effective即**跟隨-L轉址後實際取得內容的網址**, 與輸入之url可能不同,
                    //而此前它被丟掉, 呼叫端無從得知內容其實來自別站
                    '--write-out', '\n%{http_code}\n%{url_effective}',
                    '-H', 'User-Agent: ' + ua,
                    '-H', 'Accept: text/html,application/xhtml+xml',
                    '-H', 'Accept-Language: ' + acceptLang,
                    '-H', 'Referer: ' + referer,
                    url,
                ],
                { encoding: 'utf8', timeout: timeoutMs + 5000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }
            )

            //解析, 末兩行依序為http_code與url_effective(見上方--write-out)
            let lines = raw.trimEnd().split('\n')
            let finalUrl = lines.pop()
            let httpCode = parseInt(lines.pop(), 10) || 0
            let html = lines.join('\n')
            lastHttpCode = httpCode

            //HTTP狀態之判準由httpStatus模組單一擁有, 四個抓取器共用
            let bad = checkHttpStatus(httpCode)
            if (bad) {
                let out = { ok: false, retryable: bad.retryable, reason: bad.reason, message: bad.message, httpCode }
                if (bad.retryable) {
                    out.logDetail = bad.message + ' ' + url
                }
                return out
            }

            //內容過短亦不重試: 再抓一次仍是同一份內容
            if (!html || html.length < MIN_HTML_LENGTH) {
                return {
                    ok: false,
                    retryable: false,
                    reason: 'empty-response',
                    message: `response too short (${html ? html.length : 0} chars)`,
                    httpCode,
                }
            }

            return { ok: true, html, httpCode, finalUrl }
        }
        catch (err) {
            let message = err.message || String(err)
            return { ok: false, reason: 'curl-error', message, httpCode: lastHttpCode || undefined, logDetail: 'curl error: ' + message }
        }
    }

    let r = await withRetry(attemptOnce, { maxRetries, tag: 'fetchWebByCurl' })

    if (r.ok) {
        return {
            status: 'success',
            url,
            html: r.html,
            htmlLength: r.html.length,
            contentKind: 'raw',
            httpCode: r.httpCode,

            //內容實際來源之網址(跟隨-L轉址後), 與輸入之url可能不同
            finalUrl: r.finalUrl,
            method: METHOD,
            fetchedAt,
            attempts: r.attempts,
        }
    }

    return {
        status: 'error',
        url,
        message: r.message,
        reason: r.reason,
        httpCode: r.httpCode,
        method: METHOD,
        fetchedAt,
        attempts: r.attempts,
    }
}


export default fetchWebByCurl
