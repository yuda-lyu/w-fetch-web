import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import estimateVisibleText from './estimateVisibleText.mjs'
import { DETECT_PASS, DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY } from './constants.mjs'


//轉址與載入interstitial殼頁之標題關鍵字
let WRAPPER_TITLES = ['google news', 'redirecting', 'loading', 'msn']


//「幾乎無實質內容」之可見文字上限
//
//凡靠字串比對的弱判準皆須搭配本閘門, 否則談論反爬蟲的正常文章一律被誤殺。
//攔阻頁與正常文章在此維度上相距極遠, 故閘門有很大的安全餘裕:
//  攔阻頁     實測典型頁可見文字約64字
//  正常文章   實測13個真實頁面(見 test/tools/probeThreshold.mjs), 判定全部符合預期;
//             其中5個內文同時含captcha與challenge之維基條目, 可見文字為3.0萬至8.7萬,
//             對本閘門有61至174倍餘裕
//
//已知風險帶為「可見文字介於200至500且內文含關鍵字」之頁面: 低於200者另由empty判識攔下,
//高於500者不受弱判準影響。實測樣本中落在該帶者皆不含關鍵字
let SPARSE_VISIBLE_MAX = 500


//反爬蟲攔阻頁之標題前綴
//以前綴而非全等比對: 真實頁面標題常帶尾綴, 實測「Just a moment...」「Just a moment…」
//「Just a moment - 站名」在全等比對下全部漏判, 而漏判之攔阻頁文案長度多超過MIN_CONTENT,
//會被Readability解析成功而當作文章回傳
let CHALLENGE_TITLE_PREFIXES = ['just a moment', 'just a quick check', 'checking your browser', 'attention required']


//反爬蟲挑戰頁專屬之資源位址
//此三者為挑戰元件本身之來源, 與fetchWebByPlaywrightHead之VERIFY_SELECTORS同源:
//該檔認得的挑戰頁, 判識器原本一個都不認得。
//注意不可放寬為'/cdn-cgi/', 該路徑於一般Cloudflare託管站台亦大量存在(email-decode、rocket-loader等)
let CHALLENGE_RESOURCES = ['/cdn-cgi/challenge-platform', 'challenges.cloudflare.com', 'hcaptcha.com']


//建立判識用之上下文
//visible之估算須掃過整份HTML, 成本較高, 故改為惰性計算並快取,
//僅在實際用到可見文字之判識器才付出該成本
function _mkCtx(html) {

    let lower = html.toLowerCase()
    let title = html.match(/<title>([^<]*)/i)?.[1]?.trim() || ''
    let visible = null

    return {
        html,
        lower,
        title,
        titleLower: title.toLowerCase(),
        get visible() {
            if (visible === null) {
                visible = estimateVisibleText(html)
            }
            return visible
        },
    }
}


//判識器表, 依序比對, 首個命中者勝出; message可為字串或以上下文產生字串之函數
//
//evidence標明該判識器所依賴之證據形態, 決定它是否適用於合成內容:
//  structural  依賴script來源、class、id或meta標籤。抓取器穿透Shadow DOM或由
//              accessibility snapshot合成內容時, 這些結構一律被剝除, 只剩純文字——
//              證據已不存在, 留著比對只會因「內文剛好提到該字串」而誤判
//  semantic    依賴標題文字、內文文字或內容量。合成內容完整保留title與內文, 判準依然成立,
//              且這是判識合成內容的唯一手段, 不可略過
//
//此欄取代了先前三處「不含<article>」的擋板。那個擋板是為了修合成側的誤判而加,
//卻同時作用在原始側: 真挑戰頁只要含<article>標籤即被放行(實測漏判且parse成功),
//而它只掛在3個判識器上, 同類的其他判識器一個都沒有。
//
//擋板另有一個維度上的錯誤: 它想擋的是「談論反爬蟲的正常文章」, 但用的判準是
//「有沒有<article>標籤」。正確的分野是**內容量**——真攔阻頁可見文字極少(實測約64字),
//正常文章則有整篇正文。故該三項改與其他弱判準一致, 一律搭配visible門檻(見各項)
let DETECTORS = [

    //反爬蟲基礎設施特徵: 靠script來源、class或id判斷, 對合成內容不適用
    {
        type: DETECT_CAPTCHA,
        message: 'DataDome CAPTCHA',
        evidence: 'structural',
        test: (c) => c.lower.includes('captcha-delivery.com'),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'PerimeterX challenge',
        evidence: 'structural',
        test: (c) => c.lower.includes('perimeterx'),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'Cloudflare challenge',
        evidence: 'structural',
        test: (c) => c.lower.includes('cf-challenge-running'),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'Cloudflare/anti-bot challenge',
        evidence: 'semantic',
        test: (c) => CHALLENGE_TITLE_PREFIXES.some((t) => c.titleLower.startsWith(t)),
    },
    {

        //挑戰元件之資源位址搭配「幾乎無實質內容」雙條件, 缺一不可。
        //單以資源位址判定會誤殺正常頁面內嵌之Turnstile或hCaptcha表單(登入頁、留言板),
        //而攔阻頁之可見文字極少(實測典型頁約64字), 故以內容量為第二條件區隔。
        //與下方platform wrapper之雙條件同構
        type: DETECT_CAPTCHA,
        message: 'anti-bot challenge resource',
        evidence: 'structural',
        test: (c) => CHALLENGE_RESOURCES.some((v) => c.lower.includes(v)),
    },
    {

        //弱字串判準須搭配「幾乎無實質內容」之閘門, 否則談論反爬蟲的正常文章一律被誤殺
        //(本套件自身的測試fixture即為一例: 其內文寫「contains no captcha wording,
        //no challenge wording」而含有該二字)。真挑戰頁之可見文字極少, 此為兩者之分野。
        //原以c.html.length < 50000為閘門, 但位元組數與「是否為挑戰頁」只是弱相關,
        //短的正常文章一樣落在閘門內
        type: DETECT_CAPTCHA,
        message: 'generic CAPTCHA',
        evidence: 'semantic',
        test: (c) => c.lower.includes('captcha') && c.lower.includes('challenge'),
    },
    {
        type: DETECT_CAPTCHA,
        message: (c) => 'robot challenge: "' + c.title + '"',
        evidence: 'semantic',
        test: (c) => c.titleLower.includes('are you a robot'),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'Cloudflare Turnstile',
        evidence: 'structural',
        test: (c) => c.lower.includes('cf-turnstile'),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'human verification page',
        evidence: 'semantic',
        test: (c) => c.lower.includes('verify you are human'),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'server security block',
        evidence: 'semantic',
        test: (c) => c.lower.includes('blocked by our server') || c.lower.includes('request has been blocked'),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'access denied (WAF/CDN block)',
        evidence: 'semantic',
        test: (c) => c.titleLower.startsWith('access denied') || (c.lower.includes('access denied') && c.lower.includes('edgesuite.net')),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'X/Twitter error page',
        evidence: 'semantic',
        test: (c) => c.lower.includes('something went wrong') && (c.lower.includes('x.com') || c.lower.includes('twitter.com')),
    },

    //驗證頁面
    {
        type: DETECT_VERIFY,
        message: 'WeChat verification page',
        evidence: 'structural',
        test: (c) => c.lower.includes('secitptpage') && c.lower.includes('wx.qq.com'),
    },

    //轉址包裝頁
    {
        type: DETECT_REDIRECT,
        message: 'meta refresh redirect',
        evidence: 'structural',

        //比對的是HTML標籤結構而非內文字串: 正常文章即使談論meta refresh, 其範例碼亦已被轉義,
        //不會命中, 故不需內容量閘門
        anyContent: true,
        test: (c) => (c.html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=["']?([^"'\s>]*)["']?/i)?.[1] || '').replace(/[\\'"\s]/g, '').length > 0,
    },
    {
        type: DETECT_REDIRECT,
        message: 'Google News wrapper',
        evidence: 'structural',
        test: (c) => c.lower.includes('c-wiz') && c.lower.includes('news.google.com'),
    },

    //轉址與載入interstitial殼頁: 標題含平台或載入關鍵字「且」頁面幾乎無實質內容, 才判定。
    //雙條件缺一不可, 只靠標題子字串會把標題剛好含關鍵字的正常文章誤殺(實測Wikipedia
    //「Loading screen」visible約13k、「MSN」約49k被誤判為轉址頁, 導致整篇抓取失敗), 真殼頁
    //visible近0(實測MSN殼=0、Google News=1822, 後者另由上方c-wiz規則攔)
    {
        type: DETECT_REDIRECT,
        message: (c) => 'platform wrapper: "' + c.title + '"',
        evidence: 'semantic',
        test: (c) => WRAPPER_TITLES.some((t) => c.titleLower.includes(t)),
    },

    //空內容與無實質可見文字
    {
        type: DETECT_EMPTY,
        message: (c) => 'minimal visible text (' + c.visible.length + ' chars in ' + c.html.length + ' bytes HTML)',
        evidence: 'semantic',

        //本身即為內容量判準, 再套閘門為同義反覆
        anyContent: true,
        test: (c) => c.html.length > 5000 && c.visible.length < 200,
    },
]


/**
 * 由網頁原始HTML檢測頁面是否為有效內容
 *
 * 純粹基於原始HTML結構判斷，不依賴Readability，用於判識CAPTCHA與反爬蟲挑戰頁、驗證頁、
 * 轉址包裝頁、空內容頁，供階梯升級決策使用。
 * 判識器以資料表定義並依序比對，首個命中者勝出；順序本身即語意，調動順序會改變判定結果。
 *
 * contentKind標明待測內容是抓取器取回的原始文件，或由已渲染DOM萃取後合成者。
 * 合成內容之標籤結構已被剝除，故只比對semantic類判識器；預設為'raw'，
 * 亦即未指定時行為與原先一致
 *
 * @param {String} html 輸入網頁HTML字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.contentKind='raw'] 輸入內容形態字串，'raw'為原始文件，'synthesized'為合成內容，預設'raw'
 * @returns {Object} 回傳檢測結果物件，格式為{pass,type,message}，其中pass為是否通過布林值，type為'pass'、'captcha'、'verify'、'redirect'、'empty'之一，message為說明字串
 * @example
 *
 * import inspectHtml from './src/inspectHtml.mjs'
 *
 * console.log(inspectHtml('<html><head><title>Just a moment</title></head><body></body></html>'))
 * // => { pass: false, type: 'captcha', message: 'Cloudflare/anti-bot challenge' }
 *
 * console.log(inspectHtml('<html><head><title>abc</title></head><body><p>' + 'x'.repeat(300) + '</p></body></html>'))
 * // => { pass: true, type: 'pass', message: 'ok' }
 *
 */
function inspectHtml(html, opt = {}) {

    //check
    if (!isestr(html)) {
        return { pass: false, type: DETECT_EMPTY, message: 'html is required (string)' }
    }

    //合成內容只跑semantic類; 非'synthesized'之值一律視為原始文件, 跑全部判識器
    let isSynth = opt?.contentKind === 'synthesized'

    let c = _mkCtx(html)

    for (let d of DETECTORS) {
        if (isSynth && d.evidence === 'structural') {
            continue
        }

        //內容量閘門一律預設套用, 只有明確標記anyContent者例外。
        //預設為「套用」而非「不套用」, 是因為只要判準含字串比對, 正常文章談論該主題即會命中,
        //而攔阻頁與談論攔阻的文章之分野正是內容量。先前由各判識器自行決定要不要寫這個條件,
        //結果是17個判識器中只有5個有, 其餘同型者無——實測一篇1000字談反爬蟲的正常文章
        //會被human verification、server security block、PerimeterX三項誤判為攔阻頁
        if (!d.anyContent && c.visible.length >= SPARSE_VISIBLE_MAX) {
            continue
        }

        if (d.test(c)) {
            return { pass: false, type: d.type, message: isfun(d.message) ? d.message(c) : d.message }
        }
    }

    return { pass: true, type: DETECT_PASS, message: 'ok' }
}


export default inspectHtml
