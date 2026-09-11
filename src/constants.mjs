//最低有效字數(解析後)
let MIN_CONTENT = 50

//opt.method之自動階梯升級選項
//與METHOD_*不同層: 它是**輸入**選項而非結果之方法名, 不會出現在任何結果的method欄位
let METHOD_AUTO = 'auto'

//方法名稱常數, 與4個抓取函數回傳的method字串一致
//METHOD_ADAPTER為第五種: 內容由使用端adapter之fetch掛點取得, 未經本套件任一抓取器。
//此時結果另帶adapterId欄位指出是哪一個adapter, 因為'adapter'本身不足以辨識來源
let METHOD_CURL = 'curl'
let METHOD_PW_HEADLESS = 'playwright-headless'
let METHOD_PW_HEADED = 'playwright-headed'
let METHOD_CAMOFOX = 'camofox'
let METHOD_ADAPTER = 'adapter'

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

    //抓取層之契約錯誤
    //兩者刻意分名: 前者要呼叫端去修自己的adapter, 後者是套件或環境的問題, 處置不同
    'adapter-fetch-error': 'adapter之fetch拋錯或回傳形狀不合契約(顯性回報, 不落回階梯)',
    'adapter-fetch-skip': 'adapter之fetch表明此網址不適用, 改由階梯抓取',
    'adapter-fetch-miss': 'adapter之fetch取得回應但其形狀不合預期(非JSON、非物件或無正文), 與adapter-parse-miss對稱',
    'fetcher-error': '抓取器拋錯或回傳形狀不合契約',
    'internal-address': '套件自行推導之網址(轉址參數提取)於抓取後解析至內網或保留位址',

    //判識所致
    //
    //此四者即DETECT_*之四種攔阻型別。它們並非另一套值域, 而是同一組值流入reason欄位:
    //runPlan於判識未通過時以 reason: inspection.type 記錄, 該值再經attempts成為頂層reason。
    //
    //此前本清單漏列這四個, 卻同時宣稱自己是「完整值域」與「唯一權威」——
    //呼叫端依README列舉寫的分支, 碰到攔阻頁就會落到default。
    //unit-reasons之守門當時抓不到, 因為它只掃 reason: '字面量',
    //而這四個是由變數指派的; 該守門現另以DETECT_*逐一比對本表補上此缺口
    [DETECT_CAPTCHA]: '判識為CAPTCHA或反爬蟲攔阻頁',
    [DETECT_VERIFY]: '判識為驗證頁',
    [DETECT_REDIRECT]: '判識為轉址包裝頁',
    [DETECT_EMPTY]: '判識為空內容, 或解析未取得足量正文',

    //無法歸因
    'unknown': '無上游歸因可用之退路值',
})


export {
    MIN_CONTENT,
    METHOD_AUTO,
    METHOD_CURL,
    METHOD_PW_HEADLESS,
    METHOD_PW_HEADED,
    METHOD_CAMOFOX,
    METHOD_ADAPTER,
    DETECT_PASS,
    DETECT_CAPTCHA,
    DETECT_VERIFY,
    DETECT_REDIRECT,
    DETECT_EMPTY,
    PASS_INSPECTION,
    MAX_REDIRECT_DEPTH,
    REASONS
}
