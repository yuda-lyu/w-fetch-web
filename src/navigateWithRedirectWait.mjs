//等待轉址與networkidle之最長毫秒
let REDIRECT_WAIT_MS = 10000
let NETWORK_IDLE_WAIT_MS = 10000


/**
 * 導航至網址並等待JS轉址完成
 *
 * 先以domcontentloaded導航，再等待網址host脫離原host(代表已轉址)，最後等待networkidle；
 * 等待轉址與networkidle皆為盡力而為，逾時不視為失敗
 *
 * @param {Object} page 輸入Playwright之page物件
 * @param {String} url 輸入待導航網址字串
 * @param {Integer} navTimeout 輸入導航最長等待毫秒整數
 * @returns {Promise} 回傳Promise，resolve代表導航與等待流程結束
 * @example
 *
 * import { chromium } from 'playwright'
 * import navigateWithRedirectWait from './src/navigateWithRedirectWait.mjs'
 *
 * let test = async () => {
 *
 *     let browser = await chromium.launch({ headless: true, channel: 'chrome' })
 *     let page = await browser.newPage()
 *     await navigateWithRedirectWait(page, 'https://news.google.com/articles/xxxxxx', 15000)
 *     console.log(page.url())
 *     // => 'https://www.example-news.com/real-article'
 *     await browser.close()
 *
 * }
 * await test()
 *     .catch((err) => {
 *         console.log(err)
 *     })
 *
 */
async function navigateWithRedirectWait(page, url, navTimeout) {

    let originalHost = new URL(url).hostname

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout })

    await page
        .waitForURL((u) => !u.href.includes(originalHost), { timeout: REDIRECT_WAIT_MS })
        .catch(() => {})

    await page
        .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_WAIT_MS })
        .catch(() => {})
}


export default navigateWithRedirectWait
