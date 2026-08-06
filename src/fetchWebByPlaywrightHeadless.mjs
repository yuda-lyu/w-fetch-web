import { chromium } from 'playwright'
import get from 'lodash-es/get.js'
import isbol from 'wsemi/src/isbol.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isp0int from 'wsemi/src/isp0int.mjs'
import cint from 'wsemi/src/cint.mjs'
import cbol from 'wsemi/src/cbol.mjs'
import delay from 'wsemi/src/delay.mjs'
import getUrlErrorResult from './getUrlErrorResult.mjs'
import getRetryWaitMs from './getRetryWaitMs.mjs'
import navigateWithRedirectWait from './navigateWithRedirectWait.mjs'
import extractPageContent from './extractPageContent.mjs'


//方法名稱
let METHOD = 'playwright-headless'

//預設值
let DEFAULT_MAX_RETRIES = 5
let DEFAULT_NAV_TIMEOUT_MS = 15000
let DEFAULT_POST_NAV_WAIT_MS = 3000


/**
 * 使用Playwright無頭Chrome抓取網頁原始HTML
 *
 * 特點：
 * 無頭模式適用SPA等須執行JS渲染之頁面；
 * 可見文字過少時自動穿透Shadow DOM取得內文並重組為簡易HTML；
 * 失敗時自動重試(線性退避3至15秒)；
 * 使用playwright之chromium並指定channel='chrome'，故執行環境須已安裝Chrome瀏覽器
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.navigationTimeoutMs=15000] 輸入頁面導航最長等待毫秒整數，預設15000
 * @param {Integer} [opt.postNavigationWaitMs=3000] 輸入導航後額外等待毫秒整數，預設3000
 * @param {Boolean} [opt.waitForRedirect=false] 輸入是否等待JS轉址完成布林值，預設false
 * @param {Integer} [opt.maxRetries=5] 輸入失敗時最大重試次數整數，含初始共執行maxRetries+1次，預設5
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，成功時為{status:'success',url,html,htmlLength,method,fetchedAt,attempts}，失敗時為{status:'error',url,message,reason,method,fetchedAt,attempts}，本函數不會reject
 * @example
 *
 * import fetchWebByPlaywrightHeadless from './src/fetchWebByPlaywrightHeadless.mjs'
 *
 * let test = async () => {
 *
 *     let r = await fetchWebByPlaywrightHeadless('https://example.com/')
 *     console.log(r.status, r.htmlLength)
 *     // => 'success' 234
 *
 *     let re = await fetchWebByPlaywrightHeadless('abc')
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
async function fetchWebByPlaywrightHeadless(url, opt = {}) {

    //fetchedAt
    let fetchedAt = new Date().toISOString()

    //check url
    let rErr = getUrlErrorResult(url, METHOD, fetchedAt)
    if (rErr) {
        return rErr
    }

    //navTimeout
    let navTimeout = get(opt, 'navigationTimeoutMs', null)
    if (!ispint(navTimeout)) {
        navTimeout = DEFAULT_NAV_TIMEOUT_MS
    }
    else {
        navTimeout = cint(navTimeout)
    }

    //postWait
    let postWait = get(opt, 'postNavigationWaitMs', null)
    if (!isp0int(postWait)) {
        postWait = DEFAULT_POST_NAV_WAIT_MS
    }
    else {
        postWait = cint(postWait)
    }

    //waitForRedirect
    let waitForRedirect = get(opt, 'waitForRedirect', null)
    if (!isbol(waitForRedirect)) {
        waitForRedirect = false
    }
    else {
        waitForRedirect = cbol(waitForRedirect)
    }

    //maxRetries
    let maxRetries = get(opt, 'maxRetries', null)
    if (!isp0int(maxRetries)) {
        maxRetries = DEFAULT_MAX_RETRIES
    }
    else {
        maxRetries = cint(maxRetries)
    }

    let lastMessage = ''

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        let browser = null
        try {

            browser = await chromium.launch({ headless: true, channel: 'chrome' })
            let page = await browser.newPage()

            if (waitForRedirect) {
                await navigateWithRedirectWait(page, url, navTimeout)
            }
            else {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout })
                await page.waitForTimeout(postWait)
            }

            let html = await extractPageContent(page)

            return {
                status: 'success',
                url,
                html,
                htmlLength: html.length,
                method: METHOD,
                fetchedAt,
                attempts: attempt,
            }
        }
        catch (err) {
            lastMessage = err.message || String(err)
            if (attempt <= maxRetries) {
                let ms = getRetryWaitMs(attempt)
                process.stderr.write(`[fetchWebByPlaywrightHeadless] error: ${lastMessage}，等 ${ms}ms 後重試 (${attempt}/${maxRetries})\n`)
                await delay(ms)
                continue
            }
            return {
                status: 'error',
                url,
                message: lastMessage,
                reason: 'playwright-error',
                method: METHOD,
                fetchedAt,
                attempts: attempt,
            }
        }
        finally {
            if (browser) {
                await browser.close().catch(() => {})
            }
        }
    }

    return { status: 'error', url, message: lastMessage || 'max retries exceeded', reason: 'playwright-error', method: METHOD, fetchedAt, attempts: maxRetries + 1 }
}


export default fetchWebByPlaywrightHeadless
