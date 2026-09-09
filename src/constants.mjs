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
    MAX_REDIRECT_DEPTH
}
