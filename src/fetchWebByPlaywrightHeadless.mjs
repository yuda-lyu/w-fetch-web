import runPlaywright from './runPlaywright.mjs'
import { METHOD_PW_HEADLESS as METHOD } from './constants.mjs'


//預設值
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
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，成功時為{status:'success',url,html,htmlLength,contentKind,method,fetchedAt,attempts}（contentKind為'raw'或'synthesized'，後者代表內容由Shadow DOM穿透後合成），失敗時為{status:'error',url,message,reason,method,fetchedAt,attempts}，本函數不會reject
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
    return runPlaywright(url, opt, {
        method: METHOD,
        logName: 'fetchWebByPlaywrightHeadless',
        defaultPostWaitMs: DEFAULT_POST_NAV_WAIT_MS,
        launch: { headless: true, channel: 'chrome' },
    })
}


export default fetchWebByPlaywrightHeadless
