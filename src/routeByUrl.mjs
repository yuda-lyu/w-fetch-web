//依網址判識該站台須以哪一種抓取方法起手, 以及網址本身是否為含真實網址之轉址服務
//此處之網域清單為套件內建知識, 與opt.adapters之站台註冊機制互不相干:
//前者決定「用哪個抓取器」, 後者決定「取得HTML後如何解析」
//
//── 子網域寬度之取捨（本檔五組刻意不一致，這是理由） ──
//  (?:[\w-]+\.)*xxx.com   知識屬於**整個註冊網域**者用之: linkedin與youtube的轉址服務
//                         在各地區有不同子網域, 且該regex要求主機以xxx.com結尾,
//                         故notlinkedin.com之類不會命中(由unit-routeByUrl守門)
//  news.google.com        知識只屬於**該特定子網域**者寫死: google.com本身不是新聞包裝頁,
//  mp.weixin.qq.com       放寬成 (?:[\w-]+\.)*google\.com 會把整個Google誤納
//  (?:www\.)?xxx.com      尚無證據顯示其他子網域需要同樣處置者維持保守
//
//此前linkedin的兩組寫法不同(轉址提取用寬、路由用窄)而無理由——同一站台同一份知識,
//已統一為寬。新增條目時先問「這份知識屬於整個註冊網域，還是只屬於這個子網域」

import isInternalHost from './isInternalHost.mjs'


//判識C, 已知須Playwright有頭模式之網站(headless無法正確渲染內容)
let HEADED_REQUIRED_PATTERNS = [
    /^https?:\/\/(?:www\.)?wsj\.com\//,
]
/**
 * 判識網址是否為已知須Playwright有頭模式之網站
 *
 * @param {String} url 輸入網址字串
 * @returns {Boolean} 回傳是否命中之布林值
 * @example
 *
 * import { requiresHeaded } from './src/routeByUrl.mjs'
 *
 * console.log(requiresHeaded('https://www.wsj.com/articles/abc'))
 * // => true
 *
 */
function requiresHeaded(url) {
    return HEADED_REQUIRED_PATTERNS.some((p) => p.test(url))
}


//判識D, 已知須Camofox反偵測瀏覽器之網站(方法①②③皆無法通過驗證, 直接跳方法④)
let CAMOFOX_REQUIRED_PATTERNS = [
    /^https?:\/\/mp\.weixin\.qq\.com\//,
]
/**
 * 判識網址是否為已知須Camofox反偵測瀏覽器之網站
 *
 * @param {String} url 輸入網址字串
 * @returns {Boolean} 回傳是否命中之布林值
 * @example
 *
 * import { requiresCamofox } from './src/routeByUrl.mjs'
 *
 * console.log(requiresCamofox('https://mp.weixin.qq.com/s/abc'))
 * // => true
 *
 */
function requiresCamofox(url) {
    return CAMOFOX_REQUIRED_PATTERNS.some((p) => p.test(url))
}


//判識A, 已知須執行JS之轉址服務(curl永遠只拿到包裝頁)
//
//**本清單天生會過期**——站台改版即失效, 而套件的發版次數必然少於站台改版次數。
//2026-09-10實抓Google News首頁(1.8MB)驗證: `./read/` 20筆、`./articles/` **0筆**,
//亦即當時清單只涵蓋 /articles/ 與 /rss/articles/, 而網頁版早已改用 /read/。
//
//過期的代價是「白跑一次curl並抓回一份1.8MB殼頁」而非失敗: 該殼頁會被inspectHtml之
//c-wiz規則判為redirect, runPlan據此把後續playwright階改為等待轉址, 系統自癒。
//**易變的是網址清單, 兜底的是內容層**——這是本清單與判識層的分工, 新增條目時記得它只是省一次抓取
let JS_REDIRECT_PATTERNS = [
    /^https?:\/\/(?:[\w-]+\.)*linkedin\.com\/redir\/redirect/,
    /^https?:\/\/(?:[\w-]+\.)*linkedin\.com\/feed\/update/,
    /^https?:\/\/news\.google\.com\/articles\//,
    /^https?:\/\/news\.google\.com\/rss\/articles\//,
    /^https?:\/\/news\.google\.com\/read\//,
    /^https?:\/\/news\.google\.com\/stories\//,
]
/**
 * 判識網址是否為已知須執行JS之轉址服務
 *
 * @param {String} url 輸入網址字串
 * @returns {Boolean} 回傳是否命中之布林值
 * @example
 *
 * import { requiresJsRedirect } from './src/routeByUrl.mjs'
 *
 * console.log(requiresJsRedirect('https://news.google.com/articles/abc'))
 * // => true
 *
 */
function requiresJsRedirect(url) {
    return JS_REDIRECT_PATTERNS.some((p) => p.test(url))
}


//判識E, 已知SPA網站(curl拿到的是JS渲染前空殼, Readability只解析得到頁尾與導覽)
let HEADLESS_REQUIRED_PATTERNS = [
    /^https?:\/\/(?:www\.)?msn\.com\//,
]
/**
 * 判識網址是否為已知SPA網站
 *
 * @param {String} url 輸入網址字串
 * @returns {Boolean} 回傳是否命中之布林值
 * @example
 *
 * import { requiresHeadless } from './src/routeByUrl.mjs'
 *
 * console.log(requiresHeadless('https://www.msn.com/en-us/a/ar-A1'))
 * // => true
 *
 */
function requiresHeadless(url) {
    return HEADLESS_REQUIRED_PATTERNS.some((p) => p.test(url))
}


//判識B, query參數中含真實網址之轉址服務
//
//**本組之SSRF防護有兩層, 缺一不可**——此前只有第一層, 而它只擋掉整類威脅的一個變體。
//
//第一層: **每一條都必須以 ^https?:\/\/ 錨定網域**, 與本檔其餘四組一致。
//  未錨定時該子字串出現在路徑任一處即命中: 實測
//    https://attacker.example/p/youtube.com/redirect?q=http://169.254.169.254/latest/meta-data/
//  會被提取出雲端metadata端點之網址並實際發出請求。
//  **但這只擋掉「攻擊者自有網域模仿pattern」這個變體。**
//
//第二層: 提取出之目標須通過內網位址檢核(見_isUsableTarget與isInternalHost)。
//  主變體不需要攻擊者自有網域——直接用**真正的**轉址服務網址帶任意目標即可, 它完整符合錨定:
//    https://www.linkedin.com/redir/redirect?url=http%3A%2F%2F169.254.169.254%2F
//  實測(以本機端點代替內網位址)該端點確實收到請求, 內容原樣回到呼叫端。
//  它比「呼叫端直接傳內網網址」嚴重: 呼叫端若有白名單(只接受linkedin.com),
//  上面那個輸入**會通過白名單**, 而後套件自行把它換成內網端點去抓——套件打穿了呼叫端的防線。
//
//呼叫端把使用者提供之網址交給fetchWeb是常見用法(知識庫類), 故此為可觸發之SSRF。
//新增本組條目時兩層都要顧: 只加pattern而忘了目標檢核, 等於把第二層當成不存在
let URL_PARAM_PATTERNS = [
    { match: /^https?:\/\/(?:[\w-]+\.)*linkedin\.com\/redir\/redirect/, param: 'url' },
    { match: /^https?:\/\/(?:[\w-]+\.)*youtube\.com\/redirect/, param: 'q' },
]
//提取出之目標是否可用
//
//目標取自query參數, 亦即**攻擊者可控之資料**, 與呼叫端明確給定之網址性質完全不同:
//套件只把關自己推導出來的網址。呼叫端要抓自己的內網服務是正當用法, 不在此擋
//(故本檢核只在本函數內, 不放進isValidUrl)
function _isUsableTarget(target) {
    let u
    try {
        u = new URL(target)
    }
    catch {

        //解不出網址者交還給fetchWeb之isValidUrl回報invalid-url, 此處不越權判斷
        return true
    }

    //非http/https者(javascript:、file:、gopher:等)一律不提取
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return false
    }

    return !isInternalHost(u.hostname)
}


/**
 * 由轉址服務之網址中提取其query參數所帶之真實網址
 *
 * 僅處理已知會把目標網址放在query參數之服務；取出後之值已由URLSearchParams解碼一次，
 * 再解一次以處理雙重編碼，若該值非合法百分比序列則退回僅解碼一次之結果。
 *
 * 提取出之目標須通過內網位址檢核，指向迴環、私有網段、link-local或非http/https者一律不提取
 *
 * @param {String} url 輸入網址字串
 * @returns {String|null} 命中且目標可用時回傳目標網址字串，未命中或目標指向內網時回傳null
 * @example
 *
 * import { extractRedirectTarget } from './src/routeByUrl.mjs'
 *
 * console.log(extractRedirectTarget('https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fa.com%2Fb'))
 * // => 'https://a.com/b'
 *
 * console.log(extractRedirectTarget('https://www.linkedin.com/redir/redirect?url=http%3A%2F%2F169.254.169.254%2F'))
 * // => null
 *
 */
function extractRedirectTarget(url) {
    for (let { match, param } of URL_PARAM_PATTERNS) {
        if (match.test(url)) {
            let u = new URL(url)
            let target = u.searchParams.get(param)
            if (target) {

                //searchParams.get已解碼一次, 此處再解一次是為處理雙重編碼之轉址服務;
                //但對合法卻非法百分比序列之值(如url=%25解碼後為'%')會拋URIError,
                //而本函數不得使fetchWeb reject, 故攔下並退回僅解碼一次之值
                let out = target
                try {
                    out = decodeURIComponent(target)
                }
                catch {
                    out = target
                }

                //不可用之目標視為未命中: 改以原網址走一般流程, 而非把內網端點抓回來
                return _isUsableTarget(out) ? out : null
            }
        }
    }
    return null
}


export {
    requiresHeaded,
    requiresCamofox,
    requiresJsRedirect,
    requiresHeadless,
    extractRedirectTarget
}
