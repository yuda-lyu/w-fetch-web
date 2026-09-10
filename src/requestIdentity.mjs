import { getOptStr } from './getOpt.mjs'


//HTTP請求身分（User-Agent／Referer／Accept-Language）之單一擁有者
//
//此三項先前只有curl階實作, 使用者設了卻在Playwright兩階靜默失效（實測三項全不生效）。
//而auto模式之階梯為curl至headless至headed至camofox——**後三階正是curl被擋才會走到的階**,
//也就是最需要偽裝的時候, 設定卻不生效
//
//── 為何curl帶預設值而瀏覽器階不帶 ──
//curl本身沒有瀏覽器身分, 不指定就送出「curl/8.x」而被直接擋下, 故必須偽裝成瀏覽器。
//Playwright啟動的**就是**真實Chrome, 其UA與navigator.*、TLS指紋等一致;
//若在未指定時硬套一個寫死版本號的UA, 反而使UA與其餘指紋不一致, 對反偵測是負面的。
//故瀏覽器階只套用**使用者明確指定**者, 未指定時交由瀏覽器用自己的真實身分。
//此不對稱有理由, 不是漏做


//curl階之預設身分：不指定則送出curl自己的UA而被秒擋，故必須有預設
let DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
let DEFAULT_REFERER = 'https://www.google.com/'
let DEFAULT_ACCEPT_LANG = 'en-US,en;q=0.9,zh-TW;q=0.8'


/**
 * 取得使用者明確指定之HTTP請求身分，未指定者為空字串
 *
 * 供瀏覽器階使用：只有非空者才覆寫瀏覽器自身之身分
 *
 * @param {Object} opt 輸入設定物件
 * @returns {Object} 回傳{userAgent,referer,acceptLanguage}物件，未指定之項目為空字串
 * @example
 *
 * import { getRequestIdentity } from './src/requestIdentity.mjs'
 *
 * console.log(getRequestIdentity({ userAgent: 'X/1.0' }))
 * // => { userAgent: 'X/1.0', referer: '', acceptLanguage: '' }
 *
 */
function getRequestIdentity(opt) {
    return {
        userAgent: getOptStr(opt, 'userAgent', ''),
        referer: getOptStr(opt, 'referer', ''),
        acceptLanguage: getOptStr(opt, 'acceptLanguage', ''),
    }
}


/**
 * 取得curl階之HTTP請求身分，未指定者採預設值
 *
 * @param {Object} opt 輸入設定物件
 * @returns {Object} 回傳{userAgent,referer,acceptLanguage}物件
 * @example
 *
 * import { getCurlIdentity } from './src/requestIdentity.mjs'
 *
 * console.log(getCurlIdentity({}).referer)
 * // => 'https://www.google.com/'
 *
 */
function getCurlIdentity(opt) {
    let v = getRequestIdentity(opt)
    return {
        userAgent: v.userAgent || DEFAULT_UA,
        referer: v.referer || DEFAULT_REFERER,
        acceptLanguage: v.acceptLanguage || DEFAULT_ACCEPT_LANG,
    }
}


/**
 * 由請求身分組出Playwright之newPage選項
 *
 * 只帶入使用者明確指定者，全未指定時回傳空物件使瀏覽器沿用自身身分
 *
 * @param {Object} opt 輸入設定物件
 * @returns {Object} 回傳Playwright之newPage選項物件
 * @example
 *
 * import { getBrowserPageOptions } from './src/requestIdentity.mjs'
 *
 * console.log(getBrowserPageOptions({ userAgent: 'X/1.0' }))
 * // => { userAgent: 'X/1.0' }
 *
 * console.log(getBrowserPageOptions({}))
 * // => {}
 *
 */
function getBrowserPageOptions(opt) {

    let v = getRequestIdentity(opt)
    let out = {}

    if (v.userAgent !== '') {
        out.userAgent = v.userAgent
    }

    //Referer與Accept-Language於瀏覽器須以extraHTTPHeaders帶入, 無專屬選項
    let headers = {}
    if (v.referer !== '') {
        headers.Referer = v.referer
    }
    if (v.acceptLanguage !== '') {
        headers['Accept-Language'] = v.acceptLanguage
    }
    if (Object.keys(headers).length > 0) {
        out.extraHTTPHeaders = headers
    }

    return out
}


export {
    DEFAULT_UA,
    DEFAULT_REFERER,
    DEFAULT_ACCEPT_LANG,
    getRequestIdentity,
    getCurlIdentity,
    getBrowserPageOptions
}
