import { METHOD_CURL, METHOD_PW_HEADLESS, METHOD_PW_HEADED, METHOD_CAMOFOX } from './constants.mjs'
import { requiresHeaded, requiresCamofox, requiresJsRedirect, requiresHeadless } from './routeByUrl.mjs'


//各階之靜態描述
//key為抓取器識別、method為結果之方法名稱、label供訊息顯示、
//inspect表該階是否做原始內容判識、redirectAware表該階是否受轉址旗標影響
//
//Camofox一律不做判識: inspectHtml之用途為階梯升級決策, 且判識對象為抓取器取回之原始文件,
//而Camofox回傳者為accessibility snapshot合成之內容(見snapshotToHtml),
//又其為階梯最後一階, 擋下亦無可升級之方法, 只會放棄一次原本可能成功的解析
let STEPS = {
    curl: Object.freeze({ key: 'curl', method: METHOD_CURL, label: 'curl', inspect: true, redirectAware: false }),
    headless: Object.freeze({ key: 'headless', method: METHOD_PW_HEADLESS, label: 'Playwright headless', inspect: true, redirectAware: true }),
    headed: Object.freeze({ key: 'headed', method: METHOD_PW_HEADED, label: 'Playwright headed', inspect: true, redirectAware: true }),
    camofox: Object.freeze({ key: 'camofox', method: METHOD_CAMOFOX, label: 'Camofox', inspect: false, redirectAware: false }),
}


//對外method選項至階之對應
//注意'playwright'為公開選項名, 其結果之method為'playwright-headless', 兩者刻意不同名, 改動即為破壞性變更
let METHOD_OPTIONS = {
    'curl': 'curl',
    'playwright': 'headless',
    'playwright-headed': 'headed',
    'camofox': 'camofox',
}


/**
 * 依網址與選項產生執行計畫
 *
 * 四條網域分流與指定方法，差別僅在於「要跑哪幾階」，故一律表達為step陣列，
 * 交由同一個runPlan執行，不再各自複製一份「抓取至判識至解析」流程。
 *
 * 本函數只回傳**純資料**：不捕捉url與opt、不建立closure、不修改任何共享狀態。
 * 轉址旗標之初值以redirect欄位回報，由runPlan擁有其後續變化
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {String} method 輸入方法字串，'auto'代表自動階梯升級
 * @param {Boolean} doInspect 輸入是否做原始內容判識布林值，false時各階之inspect一律關閉
 * @returns {Object} 回傳{plan,redirect,log}物件，plan為step描述陣列，redirect為轉址旗標初值，log為分流說明字串；method不合法時回傳{error}
 * @example
 *
 * import buildPlan from './src/buildPlan.mjs'
 *
 * console.log(buildPlan('https://example.com/', 'auto', true).plan.map((s) => s.key))
 * // => ['curl', 'headless', 'headed', 'camofox']
 *
 * console.log(buildPlan('https://mp.weixin.qq.com/s/a', 'auto', true).plan.map((s) => s.key))
 * // => ['camofox']
 *
 */
function buildPlan(url, method, doInspect) {

    let pick = (keys, log, redirect = false) => {
        return {
            plan: keys.map((k) => (doInspect ? STEPS[k] : { ...STEPS[k], inspect: false })),
            redirect,
            log,
        }
    }

    //指定方法: 單一階, 不升級
    if (method !== 'auto') {
        let k = METHOD_OPTIONS[method]
        if (!k) {
            return { error: `unknown method "${method}" (valid: ${Object.keys(METHOD_OPTIONS).join(', ')})` }
        }
        return pick([k], '')
    }

    //判識D, 已知須Camofox之網站, 跳過方法①②③直接方法④
    if (requiresCamofox(url)) {
        return pick(['camofox'], 'camofox-required domain, jumping to camofox ...')
    }

    //判識C, 已知須headed模式之網站, 跳過curl與headless直接headed
    if (requiresHeaded(url)) {
        return pick(['headed', 'camofox'], 'headed-required domain, jumping to playwright-headed ...')
    }

    //判識A, 已知JS轉址域名, 跳過curl直接Playwright並等待轉址
    if (requiresJsRedirect(url)) {
        return pick(['headless', 'headed', 'camofox'], 'JS redirect domain, skipping curl ...', true)
    }

    //判識E, 已知SPA網站, 跳過curl直接Playwright無頭
    if (requiresHeadless(url)) {
        return pick(['headless', 'headed', 'camofox'], 'headless-required SPA domain, skipping curl ...')
    }

    //階梯式升級, curl至headless至headed至camofox
    return pick(['curl', 'headless', 'headed', 'camofox'], '')
}


export default buildPlan
