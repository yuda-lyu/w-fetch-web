import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import estimateVisibleText from './estimateVisibleText.mjs'
import { DETECT_PASS, DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY } from './constants.mjs'
import { CHALLENGE_RESOURCES } from './challengeResources.mjs'
import { isValidDetector, normalizeDetector, ORIGIN_CUSTOM } from './detectorContract.mjs'


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


//判為「空內容」之門檻: HTML夠大但可見文字極少, 即為只有框架未載入內容之頁面
//
//EMPTY_VISIBLE_MAX與extractPageContent.mjs之SHADOW_VISIBLE_THRESHOLD**必須相同**:
//後者決定「可見文字低於多少才啟動Shadow DOM穿透」, 本值決定「低於多少判為空」。
//兩者若不一致即開縫——本值調高時, 中間帶的頁面會被判空而升級, 但下一階同樣不啟動穿透,
//升級後仍是同一份空內容, 白費一階; 本值調低則出現「穿透了卻仍被判空」的頁面。
//此約束由 unit-inspectHtml 之「兩處門檻須一致」鎖住
let EMPTY_VISIBLE_MAX = 200

//HTML位元組數下限: 未達此值者即使可見文字少也可能是正常短頁(如example.com), 不判為空
let EMPTY_HTML_MIN_BYTES = 5000


//反爬蟲攔阻頁之標題前綴
//以前綴而非全等比對: 真實頁面標題常帶尾綴, 實測「Just a moment...」「Just a moment…」
//「Just a moment - 站名」在全等比對下全部漏判, 而漏判之攔阻頁文案長度多超過MIN_CONTENT,
//會被Readability解析成功而當作文章回傳
let CHALLENGE_TITLE_PREFIXES = ['just a moment', 'just a quick check', 'checking your browser', 'attention required']


//反爬蟲挑戰頁專屬之資源位址, 與有頭模式之點擊選擇器共用同一份清單
//(此前兩處各存一份形態不同的複本, 見challengeResources.mjs)


//內容量閘門是否套用於某判識器: 本判斷之唯一擁有者
//
//套用於「內建之弱判準」一種而已, 另兩種都不套:
//  strength='strong'      頁面自我宣告身分(標題前綴、meta標籤), 正常文章不會如此命名自己
//  origin=ORIGIN_CUSTOM   使用端註冊者。閘門是為了保護套件自己對全世界頁面所下的猜測,
//                         而呼叫端是**因為內建漏判了他實際遇到的頁面**才註冊, 語料與關鍵字
//                         都由他掌握; 且本機制的動機情境(內建靠empty兜底的長篇非英語攔阻頁)
//                         依定義就在閘門之上, 套了等於讓機制在唯一動機情境下必然無效。
//                         責任分野與完整理由見detectorContract.mjs檔頭
function _isVolumeGated(d) {
    return d.origin !== ORIGIN_CUSTOM && d.strength !== 'strong'
}


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
//正常文章則有整篇正文。
//
//strength標明證據強度, 決定要不要套內容量閘門:
//  weak(預設)  依賴內文出現某個字串。正常文章談論該主題即會命中, **必須**搭配內容量閘門
//  strong      頁面自我宣告其身分——標題前綴比對, 或meta refresh一類的結構事實。
//              正常文章不會這樣命名自己, 故**不**套閘門
//
//先前此欄為anyContent(語意是「要不要套閘門」), 分的不是證據強度而是「例外與否",
//於是標題型的強證據也被閘門擋掉: 實測title為「Just a moment...」之真實Cloudflare挑戰頁,
//只要文案超過500字即漏判(多語系或Enterprise自訂挑戰頁即屬此類)
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

        //標題前綴比對: 頁面以標題自我宣告身分, 正常文章不會如此命名
        strength: 'strong',
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

        //標題前綴比對, 與Cloudflare那條同型
        strength: 'strong',
        test: (c) => c.titleLower.startsWith('access denied'),
    },
    {

        //Akamai之攔阻頁: 內文同時含access denied與其CDN網域。
        //兩個條件皆為內文字串, 故仍屬弱證據——談論Akamai攔阻的文章即可能同時含此二者
        type: DETECT_CAPTCHA,
        message: 'access denied (Akamai)',
        evidence: 'semantic',
        test: (c) => c.lower.includes('access denied') && c.lower.includes('edgesuite.net'),
    },
    {
        type: DETECT_CAPTCHA,
        message: 'X/Twitter error page',
        evidence: 'semantic',
        test: (c) => c.lower.includes('something went wrong') && (c.lower.includes('//x.com') || c.lower.includes('//twitter.com')),
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
        //不會命中
        strength: 'strong',
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
        strength: 'strong',
        test: (c) => c.html.length > EMPTY_HTML_MIN_BYTES && c.visible.length < EMPTY_VISIBLE_MAX,
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
 * @param {Array} [opt.detectors=[]] 輸入使用端判識器陣列，排於內建判識器之前故優先命中，其契約以src/detectorContract.mjs為唯一事實來源，預設[]
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

    //使用端判識器排於內建之前, 與adapter之覆寫順序一致。
    //內建清單之關鍵字全為英文, 中文與其他語系之攔阻頁只能靠呼叫端自行補充——
    //套件的發版次數必然少於安裝方遇到新情況的次數, 故此處提供機制而非追加清單
    let custom = (Array.isArray(opt?.detectors) ? opt.detectors : [])
        .filter(isValidDetector)
        .map(normalizeDetector)
    let all = custom.length > 0 ? [...custom, ...DETECTORS] : DETECTORS

    let c = _mkCtx(html)

    for (let d of all) {
        if (isSynth && d.evidence === 'structural') {
            continue
        }

        //內容量閘門對內建弱判準預設套用(適用範圍見_isVolumeGated)。
        //預設為「套用」而非「不套用」, 是因為只要判準含字串比對, 正常文章談論該主題即會命中,
        //而攔阻頁與談論攔阻的文章之分野正是內容量。先前由各判識器自行決定要不要寫這個條件,
        //結果是17個判識器中只有5個有, 其餘同型者無——實測一篇1000字談反爬蟲的正常文章
        //會被human verification、server security block、PerimeterX三項誤判為攔阻頁
        if (_isVolumeGated(d) && c.visible.length >= SPARSE_VISIBLE_MAX) {
            continue
        }

        //判識器拋錯只略過該項, 不使整次判識失敗——判識器是補充保護, 與adapter之內容來源角色不同,
        //一個使用端判識器寫壞不該讓所有抓取中斷。理由詳見detectorContract.mjs
        let hit = false
        try {
            hit = d.test(c)
        }
        catch (err) {
            if (opt?.showLog !== false && d.id) {
                console.warn('[inspectHtml] detector ' + d.id + ' error: ' + (err?.message || String(err)) + ' — skipped')
            }
            continue
        }

        if (hit) {
            return { pass: false, type: d.type, message: isfun(d.message) ? d.message(c) : d.message }
        }
    }

    return { pass: true, type: DETECT_PASS, message: 'ok' }
}


export { EMPTY_VISIBLE_MAX }
export default inspectHtml
