import { chromium } from 'playwright'


//同一模式只探測一次, 探測本身就要啟動瀏覽器, 重複探測會拖慢整體測試
let cache = {}


/**
 * 檢核執行環境是否可用Playwright啟動Chrome(channel='chrome')
 *
 * 用於測試中判斷是否跳過須實際啟動瀏覽器之案例，避免無Chrome環境誤報失敗。
 *
 * 須注意無頭與有頭是兩件事：Linux之CI常裝有Chrome而無頭可用，但有頭需要X server
 * (無DISPLAY時啟動即失敗)。故探測必須與待測案例實際使用的模式一致，
 * 不可用無頭探測結果推論有頭可用
 *
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Boolean} [opt.headed=false] 輸入是否探測有頭模式布林值，預設false代表探測無頭
 * @returns {Promise} 回傳Promise，resolve回傳該模式是否可用布林值
 */
async function hasChrome(opt = {}) {

    let headed = opt.headed === true
    let key = headed ? 'headed' : 'headless'
    if (cache[key] !== undefined) {
        return cache[key]
    }

    let browser = null
    try {
        browser = await chromium.launch({ headless: !headed, channel: 'chrome' })
        cache[key] = true
        return true
    }
    catch {
        cache[key] = false
        return false
    }
    finally {
        if (browser) {
            await browser.close().catch(() => {})
        }
    }
}


export default hasChrome
