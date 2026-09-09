import { execFile } from 'child_process'
import { promisify } from 'util'
import delay from 'wsemi/src/delay.mjs'
import getUrlErrorResult from './getUrlErrorResult.mjs'
import { fetchedAtIso } from './fetchedAt.mjs'
import getRetryWaitMs, { DEFAULT_MAX_RETRIES } from './getRetryWaitMs.mjs'
import { getOptPInt, getOptP0Int, getOptStr } from './getOpt.mjs'
import { METHOD_CURL as METHOD } from './constants.mjs'


//預設值
let DEFAULT_TIMEOUT_MS = 15000
let MIN_HTML_LENGTH = 100
let DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
let DEFAULT_REFERER = 'https://www.google.com/'
let DEFAULT_ACCEPT_LANG = 'en-US,en;q=0.9,zh-TW;q=0.8'


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
 * @param {String} [opt.userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'] 輸入自訂User-Agent字串
 * @param {String} [opt.referer='https://www.google.com/'] 輸入自訂Referer字串，預設'https://www.google.com/'
 * @param {String} [opt.acceptLanguage='en-US,en;q=0.9,zh-TW;q=0.8'] 輸入自訂Accept-Language字串，預設'en-US,en;q=0.9,zh-TW;q=0.8'
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

    //ua
    let ua = getOptStr(opt, 'userAgent', DEFAULT_UA)

    //referer
    let referer = getOptStr(opt, 'referer', DEFAULT_REFERER)

    //acceptLang
    let acceptLang = getOptStr(opt, 'acceptLanguage', DEFAULT_ACCEPT_LANG)

    let lastReason = ''
    let lastMessage = ''
    let lastHttpCode = 0

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {

            //curl, url由參數陣列傳遞無命令注入風險
            let { stdout: raw } = await execFilePm(
                'curl',
                [
                    '-s', '-L', '--compressed',
                    '--max-time', String(Math.ceil(timeoutMs / 1000)),
                    '--write-out', '\n%{http_code}',
                    '-H', 'User-Agent: ' + ua,
                    '-H', 'Accept: text/html,application/xhtml+xml',
                    '-H', 'Accept-Language: ' + acceptLang,
                    '-H', 'Referer: ' + referer,
                    url,
                ],
                { encoding: 'utf8', timeout: timeoutMs + 5000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }
            )

            //解析, 末行為http_code
            let lines = raw.trimEnd().split('\n')
            let httpCode = parseInt(lines.pop(), 10) || 0
            let html = lines.join('\n')
            lastHttpCode = httpCode

            //5xx與429為可重試
            if (httpCode >= 500 || httpCode === 429) {
                lastReason = 'http-error'
                lastMessage = `HTTP ${httpCode}`
                if (attempt <= maxRetries) {
                    let ms = getRetryWaitMs(attempt)
                    process.stderr.write(`[fetchWebByCurl] HTTP ${httpCode} ${url}，等 ${ms}ms 後重試 (${attempt}/${maxRetries})\n`)
                    await delay(ms)
                    continue
                }
                return { status: 'error', url, message: lastMessage, reason: lastReason, httpCode, method: METHOD, fetchedAt, attempts: attempt }
            }

            //4xx(429除外)不重試
            if (httpCode >= 400) {
                return { status: 'error', url, message: `HTTP ${httpCode}`, reason: 'http-error', httpCode, method: METHOD, fetchedAt, attempts: attempt }
            }

            //內容過短
            if (!html || html.length < MIN_HTML_LENGTH) {
                return {
                    status: 'error',
                    url,
                    message: `response too short (${html ? html.length : 0} chars)`,
                    reason: 'empty-response',
                    httpCode,
                    method: METHOD,
                    fetchedAt,
                    attempts: attempt,
                }
            }

            //成功
            return {
                status: 'success',
                url,
                html,
                htmlLength: html.length,
                contentKind: 'raw',
                httpCode,
                method: METHOD,
                fetchedAt,
                attempts: attempt,
            }
        }
        catch (err) {
            lastReason = 'curl-error'
            lastMessage = err.message || String(err)
            if (attempt <= maxRetries) {
                let ms = getRetryWaitMs(attempt)
                process.stderr.write(`[fetchWebByCurl] curl error: ${lastMessage}，等 ${ms}ms 後重試 (${attempt}/${maxRetries})\n`)
                await delay(ms)
                continue
            }
            return {
                status: 'error',
                url,
                message: lastMessage,
                reason: lastReason,
                httpCode: lastHttpCode || undefined,
                method: METHOD,
                fetchedAt,
                attempts: attempt,
            }
        }
    }

}


export default fetchWebByCurl
