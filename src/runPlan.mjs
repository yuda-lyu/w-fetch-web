import isobj from 'wsemi/src/isobj.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import inspectHtml from './inspectHtml.mjs'
import parseArticle from './parseArticle.mjs'
import { adapt, summarizeFail, finalize } from './finalizeResult.mjs'
import { runFetchSafely } from './fetchContract.mjs'
import { wantsInspect, wantsFallback } from './adapterContract.mjs'
import { getOptBool } from './getOpt.mjs'
import { DETECT_EMPTY, DETECT_REDIRECT, PASS_INSPECTION, METHOD_CURL, METHOD_PW_HEADLESS, METHOD_PW_HEADED, METHOD_CAMOFOX } from './constants.mjs'
import fetchWebByCurl from './fetchWebByCurl.mjs'
import fetchWebByPlaywrightHeadless from './fetchWebByPlaywrightHeadless.mjs'
import fetchWebByPlaywrightHead from './fetchWebByPlaywrightHead.mjs'
import fetchWebByCamofox from './fetchWebByCamofox.mjs'


//對外公開之方法名值域, 供_methodOf把關抓取器自報值
//adapter階之step.key; 該階之抓取函數於執行期才由命中之adapter取得, 故不在FETCHER_BY_KEY內
let STEP_ADAPTER = 'adapter'

//adapter之fetch掛點所產生之三種歸因
let REASON_ADAPTER_FETCH_ERROR = 'adapter-fetch-error'
let REASON_ADAPTER_FETCH_SKIP = 'adapter-fetch-skip'
let REASON_FETCHER_ERROR = 'fetcher-error'


let KNOWN_METHODS = Object.freeze([METHOD_CURL, METHOD_PW_HEADLESS, METHOD_PW_HEADED, METHOD_CAMOFOX])


//抓取器註冊表, 以step.key為索引
//
//本套件的四種抓取方法在不同層各有一套稱呼, 此處是它們唯一的交會點:
//  step.key      計畫內部之階代號(buildPlan.STEPS)
//  fetcherKey    opt._fetchers之鍵名, 為對外文件化之測試接縫, 改名即破壞既有測試與呼叫端
//  fn            實際抓取函數
//新增第五種抓取方法時, 此表與buildPlan.STEPS各加一列即可, 不需再改其他地方
let FETCHER_BY_KEY = Object.freeze({
    curl: { fetcherKey: 'curl', fn: fetchWebByCurl },
    headless: { fetcherKey: 'playwrightHeadless', fn: fetchWebByPlaywrightHeadless },
    headed: { fetcherKey: 'playwrightHead', fn: fetchWebByPlaywrightHead },
    camofox: { fetcherKey: 'camofox', fn: fetchWebByCamofox },
})


//測試接縫: 允許以opt._fetchers置換個別抓取函數
//階梯升級須走完四階才能驗證, 真跑等於每條測試啟動Chrome兩次加camofox一次, 且有頭模式會彈實體視窗,
//無法作為常規測試; 故開此接縫供測試以假抓取函數精確驅動各升級情境。
//底線前綴表示內部用途, 未傳時一律使用真實抓取函數, 生產環境不應傳入
function _fetcherOf(opt, fetcherKey, real) {
    let fs = opt?._fetchers
    if (isobj(fs) && isfun(fs[fetcherKey])) {
        return fs[fetcherKey]
    }
    return real
}


//執行單一階之抓取, 含結構適配
//是否帶入轉址旗標由step.redirectAware決定, 該欄位於buildPlan定義, 此處不另判斷階別——
//先前由「_FETCH_BY_KEY之各條目要不要接第三參數」表達同一件事, 等於同一事實編碼於兩處
//
//轉址旗標取「計畫所判定」與「呼叫端所指定」之聯集, 不是直接覆寫。
//此前為直接覆寫: 呼叫端傳waitForRedirect:true, 抓取器實收false(實測), 選項靜默失效——
//而它是fetchWebByPlaywrightHeadless之公開選項, fetchWeb亦宣稱「其餘鍵值會轉傳給抓取函數」,
//兩份文件都讓呼叫端以為有效。與先前UA/Referer/Accept-Language在playwright階靜默失效同型
//(那次已修, 此處是同型的第二處而當時未一併查)。
//
//取聯集而非讓呼叫端全權決定: 計畫判定為轉址包裝頁時是有證據的(前一階實際抓到轉址殼頁),
//呼叫端傳false不應把它關掉; 反之呼叫端要強制等待轉址時, 計畫沒有理由否決
//
//抓取一律經runFetchSafely: 抓取器拋錯或回傳形狀不合契約時轉為結構化失敗, 不外洩為reject。
//此保護對四個內建抓取器與adapter之fetch一視同仁——內建的不拋錯故今天不出事,
//但opt._fetchers是文件化的測試接縫、adapter.fetch更是呼叫端程式碼, 兩者皆會走到這裡。
//理由與實測見fetchContract
async function _runFetcher(step, url, opt, redirect, hit) {

    //adapter階: 抓取函數於執行期才取得, 故不在FETCHER_BY_KEY內。
    //ctx由match帶下來, 與parse掛點所收到的是同一個
    if (step.key === STEP_ADAPTER) {
        let ad = hit.adapter
        let pre = 'adapter ' + ad.id + ' fetch '
        let r = await runFetchSafely((u, o) => ad.fetch(u, o, hit.ctx), url, opt, REASON_ADAPTER_FETCH_ERROR, pre)

        //'不適用'通道: adapter表明此網址它沒有, 非失敗而是「我不該被算進來」
        if (r?.status === 'skip') {
            r = { status: 'error', reason: REASON_ADAPTER_FETCH_SKIP, message: pre + 'not applicable for this url' }
        }
        return adapt(r)
    }

    let e = FETCHER_BY_KEY[step.key]
    let fn = _fetcherOf(opt, e.fetcherKey, e.fn)
    let optUse = step.redirectAware ? { ...opt, waitForRedirect: redirect || getOptBool(opt, 'waitForRedirect', false) } : opt
    return adapt(await runFetchSafely(fn, url, optUse, REASON_FETCHER_ERROR, step.label + ' '))
}


//取本階實際之方法名, 並確保其落在對外列舉內
//
//抓取器自報之method優先(它才知道自己實際做了什麼), 但須先檢核: 此前為
//`r.method || step.method`, 無任何把關——實測讓抓取器回 method:'MY-OWN-METHOD',
//該值原樣出現在對外結果之method與attempts[].method, 汙染一個對外公開的列舉。
//
//今天只因_fetchers是測試接縫而不可達, 但METHOD_*是呼叫端據以分支的契約,
//「不可達」不是「不該把關」的理由; 且此處正是未來新增抓取掛點時最先流入的位置。
//不合法時退回計畫所宣告之method, 不拋錯: 方法名是回報用的標籤, 不值得使整次抓取失敗
function _methodOf(r, step) {

    //adapter階恆由套件填, 不採信其自述值: 該掛點是呼叫端程式碼,
    //若讓它自稱'curl', 呼叫端事後看結果會以為內容是本套件爬來的
    if (step.key === STEP_ADAPTER) {
        return step.method
    }
    return KNOWN_METHODS.includes(r?.method) ? r.method : step.method
}


//依parse決定是否解析文章
//僅於抓取成功時呼叫, 故不再重複檢核r.success
//method由呼叫端傳入已把關之值, 不再自r.method取——後者未經檢核,
//是同一個決定的第二處實作(_methodOf為其唯一擁有者)
async function _applyParse(r, url, parse, hit, method) {
    if (!parse) {

        //不解析時亦須換上把關後之method: finalize由結果物件取該欄位,
        //直接回r會讓抓取器自報之未檢核值繞過_methodOf流到對外結果
        return { ...r, method }
    }
    let parsed = await parseArticle(r.html, url, hit)
    if (!parsed.success) {
        return parsed
    }
    let out = { ...parsed, method }
    if (r.snapshot) {
        out.snapshot = r.snapshot
    }
    return out
}


/**
 * 依序執行計畫中各階，首個取得可用內容者勝出
 *
 * 轉址旗標之後續變化由本函數擁有：某階被判為轉址包裝頁時，後續之Playwright階改以等待轉址方式抓取
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} opt 輸入設定物件
 * @param {Boolean} parse 輸入是否解析文章布林值
 * @param {Boolean} showLog 輸入是否顯示過程訊息布林值
 * @param {Object|null} hit 輸入已解析之adapter命中結果，由fetchWeb以findAdapter取得
 * @param {Array} plan 輸入step描述陣列，由buildPlan產生
 * @param {Boolean} redirect 輸入轉址旗標初值
 * @returns {Promise} 回傳Promise，resolve回傳對外之結果物件，本函數不會reject
 */
//依序執行計畫中各階, 首個取得可用內容者勝出; 全數未果則彙整attempts回error
async function runPlan(url, opt, parse, showLog, hit, plan, redirect) {

    let attempts = []

    for (let step of plan) {

        let tag = step.label + (redirect && step.redirectAware ? ' (redirect)' : '')
        if (showLog) {
            console.log('[fetchWeb] trying ' + tag + ' ...')
        }

        let r = await _runFetcher(step, url, opt, redirect, hit)
        let method = _methodOf(r, step)
        let isAdapterStep = step.key === STEP_ADAPTER

        //抓取失敗
        if (!r.success) {
            let rec = { method, ...summarizeFail(r) }
            if (isAdapterStep) {
                rec.adapterId = hit.adapter.id
            }
            attempts.push(rec)
            if (showLog) {
                console.warn('[fetchWeb] ' + tag + ' failed: ' + r.message)
            }

            //adapter階失敗後要不要續走其餘階, 分三個通道:
            //  契約錯誤  不落回。與match拋錯同構——呼叫端程式碼壞了, 靜默改用爬蟲會讓他永遠不知道
            //  '不適用'  恆落回, 不受fallback拘束。match只看得到網址, 而「我的來源有沒有這一篇」
            //           常要查了才知道; 那不是失敗, 是「我不該被算進來」
            //  顯性失敗  依adapter之fallback。預設落回, 使忘記宣告的後果偏保守(還抓得到, 只是走了爬蟲)
            if (isAdapterStep) {
                if (r.reason === REASON_ADAPTER_FETCH_ERROR) {
                    return finalize(url, { success: false, reason: r.reason, message: r.message }, attempts)
                }
                if (r.reason !== REASON_ADAPTER_FETCH_SKIP && !wantsFallback(hit.adapter)) {
                    return finalize(url, { success: false, reason: r.reason, message: r.message }, attempts)
                }
            }
            continue
        }

        //內容判識
        //合成內容(Shadow DOM穿透或accessibility snapshot)之標籤結構已被剝除,
        //故以contentKind告知判識器只比對semantic類判準, 詳見inspectHtml之DETECTORS註解
        //命中之adapter可宣告inspect:false豁免判識, 使「自知如何解析該站台」的呼叫端
        //不必為此關掉整次呼叫的判識; 只做關不做開, 理由見adapterContract
        let doStepInspect = step.inspect && wantsInspect(hit?.adapter)
        let inspection = doStepInspect ? inspectHtml(r.html, { contentKind: r.contentKind, detectors: opt?.detectors, showLog }) : PASS_INSPECTION
        if (!inspection.pass) {
            //reason與type同值並非冗餘: status為'blocked'的紀錄有兩種來源(判識與解析失敗),
            //兩者形狀須一致, 呼叫端才能一律讀reason取得失敗歸因而不必先分辨是哪一種。
            //先前判識這一路不帶reason, 與JSDoc及README所宣稱者不符
            let recBlk = { method, status: 'blocked', type: inspection.type, reason: inspection.type, message: inspection.message }
            if (isAdapterStep) {
                recBlk.adapterId = hit.adapter.id
            }
            attempts.push(recBlk)
            if (showLog) {
                console.warn('[fetchWeb] ' + tag + ' blocked: ' + inspection.message)
            }

            //判為轉址包裝頁者, 後續之Playwright階改以等待轉址方式抓取
            if (inspection.type === DETECT_REDIRECT) {
                redirect = true
            }
            continue
        }

        //解析
        let parsed = await _applyParse(r, url, parse, hit, method)
        if (parsed.success && isAdapterStep) {

            //method只說得出「來自某個adapter」, 說不出是哪一個, 而呼叫端可能同時註冊多個
            parsed = { ...parsed, adapterId: hit.adapter.id }
        }
        if (parsed.success) {
            //此處記的是抓取器取回之原始HTML長度, 與頂層contentLength(解析後之正文長度)不同,
            //故另名htmlLength, 避免同名不同義
            let rec = { method, status: 'success', htmlLength: r.html.length }
            if (isAdapterStep) {
                rec.adapterId = hit.adapter.id
            }
            attempts.push(rec)
            return finalize(url, parsed, attempts)
        }

        //解析失敗(SPA與JS渲染頁面)視為empty, 續下一階
        let recFail = { method, status: 'blocked', type: DETECT_EMPTY, reason: parsed.reason, message: parsed.message || 'parse failed' }
        if (isAdapterStep) {
            recFail.adapterId = hit.adapter.id
        }
        attempts.push(recFail)
        if (showLog) {
            console.warn('[fetchWeb] ' + tag + ' parse failed: ' + (parsed.message || 'empty content') + ' — escalating')
        }
    }

    //計畫內各階皆未取得可用內容
    let last = attempts[attempts.length - 1]
    return finalize(url, {
        success: false,
        reason: last?.reason || last?.type || 'unknown',
        message: last?.message || 'all methods exhausted',
    }, attempts)
}


export default runPlan
