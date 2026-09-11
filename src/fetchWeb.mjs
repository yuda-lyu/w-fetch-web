import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import isValidUrl from './isValidUrl.mjs'
import inspectHtml from './inspectHtml.mjs'
import defaultAdapters from './defaultAdapters.mjs'
import buildPlan from './buildPlan.mjs'
import runPlan from './runPlan.mjs'
import findAdapter from './findAdapter.mjs'
import { finalize } from './finalizeResult.mjs'
import { extractRedirectTarget } from './routeByUrl.mjs'
import { MAX_REDIRECT_DEPTH, METHOD_AUTO } from './constants.mjs'
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
 * **並行呼叫之限制**：方法④之Camofox server綁定固定埠（預設19377），同一埠號同時只能有一個抓取，
 * 詳見fetchWebByCamofox之說明。auto模式可能升級至該階，故同時發動多個fetchWeb時，
 * 若其中一個以上走到方法④即會互相破壞（先完成者殺掉server，其餘回'camofox-error'）。
 * 需要並行時須為每個呼叫指定互不相同的opt.port；方法①②③則無此限制
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} [opt={}] 輸入設定物件，其餘鍵值會轉傳給實際執行抓取之函數，預設{}
 * @param {String} [opt.method='auto'] 輸入指定抓取方法字串，可為'auto'、'curl'、'playwright'、'playwright-headed'、'camofox'，'auto'代表自動階梯升級，預設'auto'。本選項塑形的是「要爬的時候用哪一種爬法」，不影響adapter之fetch掛點是否執行（後者回答的是「這次要不要爬」）
 * @param {Boolean} [opt.parse=true] 輸入是否以Readability解析出文章標題與內文布林值，false時直接回傳原始HTML，預設true
 * @param {Array} [opt.adapters=[]] 輸入站台adapter物件陣列，用於覆寫特定站台之取得、判識與解析方式，預設[]。形狀為{id,match,fetch,parse,inspect,fallback}，三個掛點分屬管線的三個階段且各自獨立：fetch取代爬取（呼叫端有官方API、快取或已登入session時）、inspect為false表此adapter命中時不做原始內容判識、parse覆寫解析；fallback為false表fetch失敗時不落回階梯。parse另收第四參數meta（含requestUrl、finalUrl、httpCode、method、contentKind），供其分辨內容實際來自哪裡；其完整契約（輸入形狀、輸出檢核、錯誤邊界）以src/adapterContract.mjs為唯一事實來源。使用端adapters排於內建adapters(gelonghui、bloomberg)之前故可覆寫之
 * @param {Array} [opt.detectors=[]] 輸入使用端判識器物件陣列，用於補充內建判識器所不涵蓋之攔阻頁形態（如中文與其他語系之挑戰頁），排於內建之前故優先命中，預設[]。形狀為{type,message,test}，其完整契約以src/detectorContract.mjs為唯一事實來源
 * @param {Boolean} [opt.inspect=true] 輸入是否以inspectHtml對抓取結果做原始內容判識布林值，預設true。關閉後不因判定為挑戰頁或空內容而升級。此為**整次呼叫**之總開關；若只想豁免特定站台，改以該站台adapter之inspect:false表達，範圍較精確且不必在呼叫端重寫一次網址判斷
 * @param {Object} [opt._fetchers=null] 輸入置換抓取函數之物件，僅供測試使用，鍵可為'curl'、'playwrightHeadless'、'playwrightHead'、'camofox'，值為與對應fetchWebByXxx同簽章之函數，未給之鍵沿用實際實作，預設null
 * @param {Boolean} [opt.showLog=true] 輸入是否顯示階梯升級過程訊息布林值，預設true
 * @param {Integer} [opt.maxRetries=5] 輸入各抓取函數失敗時最大重試次數整數，含初始共執行maxRetries+1次，預設5
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，其中attempts為各階嘗試紀錄陣列，成功之紀錄為{method,status:'success',htmlLength}(htmlLength為原始HTML長度，與頂層contentLength之正文長度不同)，失敗為{method,status:'failed',reason,message}，被判識或解析失敗為{method,status:'blocked',type,reason,message}（判識所致者reason與type同值）；經adapter之fetch掛點者其method為'adapter'且紀錄與頂層皆另帶adapterId；parse=true成功時為{status:'success',url,title,content,contentLength,method,fetchedAt,attempts}，parse=false成功時為{status:'success',url,html,method,fetchedAt,attempts}；內容來自轉址後之另一網址時另帶finalUrl（url為本套件最後實際發出請求之網址，finalUrl為內容實際來源，兩者相同時不輸出該欄），失敗時為{status:'error',url,message,fetchedAt,attempts}，本函數不會reject
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
    let method = getOptStr(opt, 'method', METHOD_AUTO)

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
    if (method === METHOD_AUTO && depth < MAX_REDIRECT_DEPTH) {
        let target = extractRedirectTarget(url)
        if (target) {
            if (showLog) {
                console.log('[fetchWeb] redirect param extracted → ' + target)
            }
            return fetchWeb(target, { ...opt, _depth: depth + 1 })
        }
    }

    //adapter於執行計畫產生前解析一次, 供整次抓取共用
    //
    //挑選只取決於**網址**, 與抓回之HTML無關, 故整個計畫內恆為同一結果。
    //此前挑選寫在parseArticle內, 每成功抓取一階就重跑一次: 使用端之match可為async且可做I/O,
    //四階即最多四次; 且若match每次回傳不同結果(非決定性), 各階會用到不同adapter而不自知。
    //更嚴重的是match拋錯這條路——實測整條階梯4次網路抓取全部跑完, 每階都得到同一個錯誤。
    //
    //**閘門是「挑到之後諮詢哪些掛點」, 不是「要不要挑」**:
    //  fetch與inspect宣告   與opt.parse無關, 恆諮詢
    //  parse               僅opt.parse為true時諮詢(由runPlan依parse決定)
    //此前以opt.parse決定要不要挑adapter, 理由是「關閉解析的呼叫端會新收到一種用不到的失敗」;
    //該理由在adapter只有parse一個掛點時成立, 加上inspect與fetch掛點後前提即消失——
    //實測parse:false時match呼叫次數為0, 宣告的inspect:false完全不生效而白跑四階
    let hit = await findAdapter(url, adapters)

    //match拋錯不得靜默改走預設解析器: 呼叫端註冊adapter即代表選定該階段,
    //靜默替換等於讓其經歷未選擇的處理管線階段。
    //attempts為空陣列而非各階之blocked紀錄, 與invalid-url、invalid-method一致——
    //此類失敗在發出任何請求前即確定, 沒有任何抓取方法被嘗試過
    if (hit.type === 'error') {
        if (showLog) {
            console.warn('[fetchWeb] ' + hit.message + ' — aborted before fetching')
        }
        return finalize(url, { success: false, reason: 'adapter-error', message: hit.message }, [])
    }

    //命中之adapter具fetch掛點時, 計畫最前多一個adapter階
    let hasFetchAdapter = hit.type === 'hit' && isfun(hit.adapter.fetch)

    //產生執行計畫(純資料)後交由單一runner執行; 轉址旗標之後續變化由runner擁有
    let { plan, error, log, redirect } = buildPlan(url, method, doInspect, hasFetchAdapter)
    if (error) {
        return finalize(url, { success: false, reason: 'invalid-method', message: error }, [])
    }
    if (log && showLog) {
        console.log('[fetchWeb] ' + log)
    }

    return runPlan(url, opt, parse, showLog, hit, plan, redirect)
}


export { inspectHtml, defaultAdapters }
export default fetchWeb
