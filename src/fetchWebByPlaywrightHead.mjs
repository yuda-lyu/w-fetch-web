import runPlaywright from './runPlaywright.mjs'
import { METHOD_PW_HEADED as METHOD } from './constants.mjs'
import { getOptBool } from './getOpt.mjs'


//預設值
let DEFAULT_POST_NAV_WAIT_MS = 5000


//驗證iframe之選取器
let VERIFY_SELECTORS = [
    'iframe[src*="challenges.cloudflare.com"]',
    'iframe[src*="/cdn-cgi/challenge-platform"]',
    '.cf-turnstile iframe',
    'iframe[src*="hcaptcha.com"]',
]


//模擬人類滑鼠軌跡, 隨機起點至中途點至目標, 並加隨機抖動與停頓
async function _humanClick(page, x, y) {

    let startX = 100 + Math.random() * 200
    let startY = 500 + Math.random() * 100
    await page.mouse.move(startX, startY)

    let steps = 2 + Math.floor(Math.random() * 2)
    for (let i = 1; i <= steps; i++) {
        let ratio = i / (steps + 1)
        let mx = startX + (x - startX) * ratio + (Math.random() - 0.5) * 30
        let my = startY + (y - startY) * ratio + (Math.random() - 0.5) * 20
        await page.mouse.move(mx, my)
        await page.waitForTimeout(80 + Math.random() * 120)
    }

    await page.mouse.move(x, y)
    await page.waitForTimeout(50 + Math.random() * 100)
    await page.mouse.click(x, y)
}


//偵測並點擊驗證checkbox(Cloudflare Turnstile、hCaptcha等)
async function _tryClickVerification(page) {

    //模式A, DOM中可見之iframe(傳統嵌入)
    for (let sel of VERIFY_SELECTORS) {
        let el = page.locator(sel).first()
        let count = await el.count().catch(() => 0)
        if (count > 0) {
            let box = await el.boundingBox().catch(() => null)
            if (box) {
                await _humanClick(page, box.x + box.width / 2, box.y + box.height / 2)
                process.stderr.write(`[fetchWebByPlaywrightHead] clicked verification iframe (${sel})\n`)
                await page.waitForTimeout(5000)
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
                return true
            }
        }
    }

    //模式B, Cloudflare managed challenge整頁(iframe不在DOM, 須透過page.frames)
    let cfFrame = page.frames().find((f) => f.url().includes('challenges.cloudflare.com'))
    if (cfFrame) {
        let container = page.locator('#turnstile-container, #turnstileWrapper, .cf-turnstile').first()
        let box = await container.boundingBox().catch(() => null)
        if (box) {
            await _humanClick(page, box.x + 30, box.y + box.height / 2)
        }
        else {
            let vp = page.viewportSize() || { width: 1280, height: 720 }
            await _humanClick(page, vp.width * 0.39, vp.height * 0.57)
        }
        process.stderr.write('[fetchWebByPlaywrightHead] clicked Cloudflare managed challenge checkbox\n')
        await page.waitForTimeout(8000)
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        return true
    }

    return false
}


//導航後之處理: 隱藏webdriver標記已於開頁時完成, 此處負責驗證checkbox之偵測與點擊
async function _afterNavigate(page, opt) {

    let skipVerify = getOptBool(opt, 'skipVerificationClick', false)

    let verificationClicked = false
    if (!skipVerify) {
        verificationClicked = await _tryClickVerification(page)
    }

    return { verificationClicked }
}


//開頁後之前置處理: 隱藏webdriver標記
async function _onPage(page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
}


/**
 * 使用Playwright有頭Chrome抓取網頁原始HTML，含驗證checkbox自動點擊
 *
 * 特點：
 * 有頭模式(實體視窗)並加反自動化偽裝(隱藏webdriver、disable-blink-features)；
 * 自動偵測並點擊Cloudflare Turnstile與hCaptcha等驗證checkbox(模擬人類滑鼠軌跡)；
 * 可見文字過少時自動穿透Shadow DOM取得內文並重組為簡易HTML；
 * 失敗時自動重試(線性退避3至15秒)；
 * 使用playwright之chromium並指定channel='chrome'，故執行環境須已安裝Chrome瀏覽器，且執行時會開啟實體瀏覽器視窗
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.navigationTimeoutMs=15000] 輸入頁面導航最長等待毫秒整數，預設15000
 * @param {Integer} [opt.postNavigationWaitMs=5000] 輸入導航後額外等待毫秒整數，預設5000
 * @param {Boolean} [opt.waitForRedirect=false] 輸入是否等待JS轉址完成布林值，預設false
 * @param {Boolean} [opt.skipVerificationClick=false] 輸入是否跳過驗證checkbox自動點擊布林值，預設false
 * @param {Integer} [opt.maxRetries=5] 輸入失敗時最大重試次數整數，含初始共執行maxRetries+1次，預設5
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，成功時為{status:'success',url,html,htmlLength,contentKind,verificationClicked,method,fetchedAt,attempts}（contentKind為'raw'或'synthesized'，後者代表內容由Shadow DOM穿透後合成），失敗時為{status:'error',url,message,reason,method,fetchedAt,attempts}，本函數不會reject
 * @example
 *
 * import fetchWebByPlaywrightHead from './src/fetchWebByPlaywrightHead.mjs'
 *
 * let test = async () => {
 *
 *     let r = await fetchWebByPlaywrightHead('https://example.com/')
 *     console.log(r.status, r.verificationClicked, r.htmlLength)
 *     // => 'success' false 234
 *
 *     let re = await fetchWebByPlaywrightHead('abc')
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
async function fetchWebByPlaywrightHead(url, opt = {}) {
    return runPlaywright(url, opt, {
        method: METHOD,
        logName: 'fetchWebByPlaywrightHead',
        defaultPostWaitMs: DEFAULT_POST_NAV_WAIT_MS,
        launch: {
            headless: false,
            channel: 'chrome',
            args: ['--disable-blink-features=AutomationControlled'],
        },
        onPage: _onPage,
        afterNavigate: _afterNavigate,
    })
}


export default fetchWebByPlaywrightHead
