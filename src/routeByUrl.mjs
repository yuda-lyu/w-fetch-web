//依網址判識該站台須以哪一種抓取方法起手, 以及網址本身是否為含真實網址之轉址服務
//此處之網域清單為套件內建知識, 與opt.adapters之站台註冊機制互不相干:
//前者決定「用哪個抓取器」, 後者決定「取得HTML後如何解析」

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
let JS_REDIRECT_PATTERNS = [
    /^https?:\/\/(?:www\.)?linkedin\.com\/redir\/redirect/,
    /^https?:\/\/(?:www\.)?linkedin\.com\/feed\/update/,
    /^https?:\/\/news\.google\.com\/articles\//,
    /^https?:\/\/news\.google\.com\/rss\/articles\//,
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
let URL_PARAM_PATTERNS = [
    { match: /linkedin\.com\/redir\/redirect/, param: 'url' },
    { match: /youtube\.com\/redirect/, param: 'q' },
]
/**
 * 由轉址服務之網址中提取其query參數所帶之真實網址
 *
 * 僅處理已知會把目標網址放在query參數之服務；取出後之值已由URLSearchParams解碼一次，
 * 再解一次以處理雙重編碼，若該值非合法百分比序列則退回僅解碼一次之結果
 *
 * @param {String} url 輸入網址字串
 * @returns {String|null} 命中時回傳目標網址字串，未命中時回傳null
 * @example
 *
 * import { extractRedirectTarget } from './src/routeByUrl.mjs'
 *
 * console.log(extractRedirectTarget('https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fa.com%2Fb'))
 * // => 'https://a.com/b'
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
                try {
                    return decodeURIComponent(target)
                }
                catch {
                    return target
                }
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
