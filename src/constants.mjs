//最低有效字數(解析後)
let MIN_CONTENT = 50

//方法名稱常數, 與4個抓取函數回傳的method字串一致
let METHOD_CURL = 'curl'
let METHOD_PW_HEADLESS = 'playwright-headless'
let METHOD_PW_HEADED = 'playwright-headed'
let METHOD_CAMOFOX = 'camofox'

//檢測結果類型常數
let DETECT_PASS = 'pass'
let DETECT_CAPTCHA = 'captcha'
let DETECT_VERIFY = 'verify'
let DETECT_REDIRECT = 'redirect'
let DETECT_EMPTY = 'empty'

//略過檢測時代入之通過結果
let PASS_INSPECTION = Object.freeze({ pass: true, type: DETECT_PASS, message: 'ok' })

//轉址提取之最大遞迴深度
let MAX_REDIRECT_DEPTH = 3


//失敗歸因(reason)之完整值域：本清單為其唯一權威
//
//reason與METHOD_*、DETECT_*同為對外公開之列舉，呼叫端據以分支決定重試、告警或修adapter。
//此前另二者集中於本檔而reason散在12個檔共35處，無處可查其完整值域，README亦未列舉。
//
//實作端刻意仍寫字串字面量而非引用本清單：對外契約是「值域」不是「變數名」，
//而測試須以字面量斷言才測得到值本身（測試若引用同一常數，值改錯時測試會跟著錯）。
//兩者之一致性由 unit-reasons 之守門測試強制：src內出現的每個reason都須登記於此
let REASONS = Object.freeze({

    //輸入不合法, 未發出任何請求
    'invalid-url': '網址非字串或非http/https',
    'invalid-method': 'opt.method不在支援清單內',

    //抓取層失敗
    'http-error': 'HTTP狀態碼為4xx或5xx',
    'empty-response': 'HTTP回應本文過短(curl階)',
    'curl-error': 'curl執行失敗(連線失敗、逾時等)',
    'playwright-error': 'Playwright導航或取內容失敗',
    'camofox-not-found': '未安裝@askjo/camofox-browser',
    'camofox-error': 'Camofox server啟動、tab建立或snapshot傳輸失敗(可重試)',
    'camofox-empty': 'Camofox取得之snapshot確實無足量內容(重試無益)',

    //解析層失敗
    'parse-error': 'Readability或adapter之parse拋錯或回傳非法結果',
    'empty-content': '解析出之正文未達MIN_CONTENT',
    'adapter-error': 'adapter之match拋錯(顯性回報, 不靜默改用預設解析器)',
    'adapter-parse-failed': 'adapter回success:false且未自報reason',
    'adapter-parse-miss': 'adapter命中網域但頁面缺少其預期之結構',

    //無法歸因
    'unknown': '無上游歸因可用之退路值',
})


export {
    MIN_CONTENT,
    METHOD_CURL,
    METHOD_PW_HEADLESS,
    METHOD_PW_HEADED,
    METHOD_CAMOFOX,
    DETECT_PASS,
    DETECT_CAPTCHA,
    DETECT_VERIFY,
    DETECT_REDIRECT,
    DETECT_EMPTY,
    PASS_INSPECTION,
    MAX_REDIRECT_DEPTH,
    REASONS
}
