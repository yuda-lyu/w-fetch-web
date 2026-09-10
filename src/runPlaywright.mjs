import { chromium } from 'playwright'
import getUrlErrorResult from './getUrlErrorResult.mjs'
import { fetchedAtIso } from './fetchedAt.mjs'
import { DEFAULT_MAX_RETRIES } from './getRetryWaitMs.mjs'
import withRetry from './withRetry.mjs'
import navigateWithRedirectWait from './navigateWithRedirectWait.mjs'
import extractPageContent from './extractPageContent.mjs'
import { getOptPInt, getOptP0Int, getOptBool } from './getOpt.mjs'


//預設值
let DEFAULT_NAV_TIMEOUT_MS = 15000


//單次嘗試: 開瀏覽器、導航、取內容, 並於回傳前必定關閉瀏覽器
//資源在本函數回傳前釋放, 呼叫端才可安全進入重試退避
async function _runOnce(url, opt, cfg, o) {

    let browser = null
    try {

        browser = await chromium.launch(cfg.launch)
        let page = await browser.newPage()

        if (cfg.onPage) {
            await cfg.onPage(page)
        }

        if (o.waitForRedirect) {
            await navigateWithRedirectWait(page, url, o.navTimeout)
        }
        else {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: o.navTimeout })
            await page.waitForTimeout(o.postWait)
        }

        let extra = cfg.afterNavigate ? await cfg.afterNavigate(page, opt) : {}
        let { html, contentKind } = await extractPageContent(page)

        return { ok: true, html, contentKind, extra }
    }
    catch (err) {
        return { ok: false, message: err.message || String(err) }
    }
    finally {
        if (browser) {
            await browser.close().catch(() => {})
        }
    }
}


/**
 * 以Playwright抓取網頁原始HTML之共用流程
 *
 * 無頭與有頭兩種模式僅差別於：方法名稱、導航後預設等待毫秒、瀏覽器啟動參數、
 * 開頁後之前置處理、導航後之額外處理與其帶回之結果欄位。
 * 其餘（網址檢核、選項解析、重試與線性退避、Shadow DOM穿透、瀏覽器關閉）完全相同，
 * 故收斂於本函數，由fetchWebByPlaywrightHeadless與fetchWebByPlaywrightHead各自帶入設定
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} opt 輸入設定物件，由呼叫端原樣轉入
 * @param {Object} cfg 輸入模式設定物件
 * @param {String} cfg.method 輸入方法名稱字串，寫入結果物件之method欄位
 * @param {String} cfg.logName 輸入重試訊息之前綴名稱字串
 * @param {Integer} cfg.defaultPostWaitMs 輸入導航後等待毫秒之預設值整數
 * @param {Object} cfg.launch 輸入chromium.launch之參數物件
 * @param {Function} [cfg.onPage=null] 輸入開頁後、導航前之前置處理async函數，簽章為(page)，預設null
 * @param {Function} [cfg.afterNavigate=null] 輸入導航後、取內容前之處理async函數，簽章為(page,opt)，其回傳物件會併入成功結果，預設null
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，成功時為{status:'success',url,html,htmlLength,contentKind,...cfg.afterNavigate之回傳,method,fetchedAt,attempts}，失敗時為{status:'error',url,message,reason,method,fetchedAt,attempts}，本函數不會reject
 */
async function runPlaywright(url, opt, cfg) {

    //fetchedAt
    let fetchedAt = fetchedAtIso()

    //check url
    let rErr = getUrlErrorResult(url, cfg.method, fetchedAt)
    if (rErr) {
        return rErr
    }

    //navTimeout
    let navTimeout = getOptPInt(opt, 'navigationTimeoutMs', DEFAULT_NAV_TIMEOUT_MS)

    //postWait
    let postWait = getOptP0Int(opt, 'postNavigationWaitMs', cfg.defaultPostWaitMs)

    //waitForRedirect
    let waitForRedirect = getOptBool(opt, 'waitForRedirect', false)

    //maxRetries
    let maxRetries = getOptP0Int(opt, 'maxRetries', DEFAULT_MAX_RETRIES)

    //單次嘗試自行擁有browser之生命週期, 回傳前必定關閉。
    //不可把close放在重試迴圈之finally——finally晚於catch內之await delay,
    //會使失敗的browser在退避的3至15秒期間繼續存活
    let r = await withRetry(() => _runOnce(url, opt, cfg, { navTimeout, postWait, waitForRedirect }), {
        maxRetries,
        tag: cfg.logName,
    })

    if (r.ok) {
        return {
            status: 'success',
            url,
            html: r.html,
            htmlLength: r.html.length,
            contentKind: r.contentKind,
            ...r.extra,
            method: cfg.method,
            fetchedAt,
            attempts: r.attempts,
        }
    }

    return {
        status: 'error',
        url,
        message: r.message,
        reason: 'playwright-error',
        method: cfg.method,
        fetchedAt,
        attempts: r.attempts,
    }
}


export default runPlaywright
