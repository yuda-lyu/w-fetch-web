import isestr from 'wsemi/src/isestr.mjs'
import isValidUrl from './isValidUrl.mjs'
import inspectHtml from './inspectHtml.mjs'
import defaultAdapters from './defaultAdapters.mjs'
import buildPlan from './buildPlan.mjs'
import runPlan from './runPlan.mjs'
import { finalize } from './finalizeResult.mjs'
import { extractRedirectTarget } from './routeByUrl.mjs'
import { MAX_REDIRECT_DEPTH } from './constants.mjs'
import { getOptStr, getOptBool, getOptArr, getOptP0Int } from './getOpt.mjs'


/**
 * 抓取網頁文章內容，支援四種抓取方法自動階梯升級
 *
 * 抓取方法：
 * 方法①curl(預設，繞過TLS指紋)，委派fetchWebByCurl；
 * 方法②Playwright無頭(SPA動態渲染頁面)，委派fetchWebByPlaywrightHeadless；
 * 方法③Playwright有頭(反自動化偵測)，委派fetchWebByPlaywrightHead；
 * 方法④Camofox反偵測瀏覽器(Cloudflare等)，委派fetchWebByCamofox
 *
 * 本函數僅負責階梯升級、內容判識、文章解析之調度，實際抓取由4個抓取函數執行，
 * 流程為fetch(委派)至inspectHtml(原始內容檢測)至Readability解析(可選)；
 * 對已知網站另有轉址提取、跳過特定方法之判識規則，且方法④會額外回傳snapshot欄位
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} [opt={}] 輸入設定物件，其餘鍵值會轉傳給實際執行抓取之函數，預設{}
 * @param {String} [opt.method='auto'] 輸入指定抓取方法字串，可為'auto'、'curl'、'playwright'、'playwright-headed'、'camofox'，'auto'代表自動階梯升級，預設'auto'
 * @param {Boolean} [opt.parse=true] 輸入是否以Readability解析出文章標題與內文布林值，false時直接回傳原始HTML，預設true
 * @param {Array} [opt.adapters=[]] 輸入站台adapter物件陣列，用於覆寫特定站台之內容解析方式，預設[]。形狀為{id,match,parse}，其完整契約（輸入形狀、輸出檢核、錯誤邊界）以src/adapterContract.mjs為唯一事實來源。使用端adapters排於內建adapters(gelonghui、bloomberg)之前故可覆寫之
 * @param {Boolean} [opt.inspect=true] 輸入是否以inspectHtml對抓取結果做原始內容判識布林值，預設true。關閉後不因判定為挑戰頁或空內容而升級，供呼叫端在已註冊adapter、自知如何解析該站台時避免內容被通用判識先行攔下（如內嵌__NEXT_DATA__但可見文字極少之頁面）
 * @param {Object} [opt._fetchers=null] 輸入置換抓取函數之物件，僅供測試使用，鍵可為'curl'、'playwrightHeadless'、'playwrightHead'、'camofox'，值為與對應fetchWebByXxx同簽章之函數，未給之鍵沿用實際實作，預設null
 * @param {Boolean} [opt.showLog=true] 輸入是否顯示階梯升級過程訊息布林值，預設true
 * @param {Integer} [opt.maxRetries=5] 輸入各抓取函數失敗時最大重試次數整數，含初始共執行maxRetries+1次，預設5
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，其中attempts為各階嘗試紀錄陣列，成功之紀錄為{method,status:'success',htmlLength}(htmlLength為原始HTML長度，與頂層contentLength之正文長度不同)，失敗為{method,status:'failed',reason,message}，被判識或解析失敗為{method,status:'blocked',type,reason,message}（判識所致者reason與type同值）；parse=true成功時為{status:'success',url,title,content,contentLength,method,fetchedAt,attempts}，parse=false成功時為{status:'success',url,html,method,fetchedAt,attempts}，失敗時為{status:'error',url,message,fetchedAt,attempts}，本函數不會reject
 * @example
 *
 * import fetchWeb from './src/fetchWeb.mjs'
 *
 * let test = async () => {
 *
 *     //auto模式, 解析出文章標題與內文
 *     let r = await fetchWeb('https://example.com/')
 *     console.log(r.status, r.method, r.title, r.contentLength)
 *     // => 'success' 'curl' 'Example Domain' 111
 *
 *     //指定curl且不解析, 直接取原始HTML
 *     let rh = await fetchWeb('https://example.com/', { method: 'curl', parse: false })
 *     console.log(rh.status, rh.html.length)
 *     // => 'success' 559
 *
 *     //失敗時回傳error結果物件, 不會reject
 *     let re = await fetchWeb('abc')
 *     console.log(re.status, re.message)
 *     // => 'error' 'invalid url (must be http/https)'
 *
 * }
 * await test()
 *     .catch((err) => {
 *         console.log(err)
 *     })
 *
 */
async function fetchWeb(url, opt = {}) {

    //check url
    //須於此攔截無效網址, 否則auto模式會空跑完4種抓取方法才逐一失敗
    if (!isestr(url)) {
        return finalize(String(url), { success: false, reason: 'invalid-url', message: 'url is required (string)' }, [])
    }
    if (!isValidUrl(url)) {
        return finalize(url, { success: false, reason: 'invalid-url', message: 'invalid url (must be http/https)' }, [])
    }

    //method
    let method = getOptStr(opt, 'method', 'auto')

    //parse
    let parse = getOptBool(opt, 'parse', true)

    //showLog
    let showLog = getOptBool(opt, 'showLog', true)

    //inspect, 與parse對稱之開關
    //關閉後不做原始內容判識, 亦即不因判定為挑戰頁或空內容而升級;
    //供呼叫端在已註冊adapter、自知如何解析該站台時，避免內容被通用判識先行攔下
    let doInspect = getOptBool(opt, 'inspect', true)

    //adapters, 使用端註冊者排於內建之前, 故可覆寫內建同網域adapter
    let optAdapters = getOptArr(opt, 'adapters', [])
    let adapters = [...optAdapters, ...defaultAdapters]

    //auto模式之轉址提取
    let depth = getOptP0Int(opt, '_depth', 0)

    //判識B, 網址參數中含真實網址, 提取後以目標網址重走完整流程
    if (method === 'auto' && depth < MAX_REDIRECT_DEPTH) {
        let target = extractRedirectTarget(url)
        if (target) {
            if (showLog) {
                console.log('[fetchWeb] redirect param extracted → ' + target)
            }
            return fetchWeb(target, { ...opt, _depth: depth + 1 })
        }
    }

    //產生執行計畫(純資料)後交由單一runner執行; 轉址旗標之後續變化由runner擁有
    let { plan, error, log, redirect } = buildPlan(url, method, doInspect)
    if (error) {
        return finalize(url, { success: false, reason: 'invalid-method', message: error }, [])
    }
    if (log && showLog) {
        console.log('[fetchWeb] ' + log)
    }

    return runPlan(url, opt, parse, showLog, adapters, plan, redirect)
}


export { inspectHtml, defaultAdapters }
export default fetchWeb
