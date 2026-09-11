import isobj from 'wsemi/src/isobj.mjs'
import isfun from 'wsemi/src/isfun.mjs'


//測試接縫之取用規則：本模組為其唯一事實來源
//
//opt._fetchers 允許以假函數置換個別抓取函數。階梯升級須走完四階才能驗證,
//真跑等於每條測試啟動 Chrome 兩次加 camofox 一次, 且有頭模式會彈實體視窗,
//無法作為常規測試; 故開此接縫供測試以假抓取函數精確驅動各情境。
//底線前綴表示內部用途, 未傳時一律使用真實抓取函數, 生產環境不應傳入。
//
//此規則原寫在 runPlan 內; 內建 msn adapter 之 fetch 掛點亦須經 curl 呼叫其內容 API,
//且同樣需要被測試置換——若在 adapter 內再手寫一份「有 _fetchers.curl 就用它」,
//即是同一個決定的第二處實作, 兩處日後會分歧(例如一處加了型別檢核、另一處沒有)


/**
 * 依測試接縫取出應使用之抓取函數
 *
 * @param {Object} opt 輸入設定物件
 * @param {String} fetcherKey 輸入接縫鍵名字串，可為'curl'、'playwrightHeadless'、'playwrightHead'、'camofox'
 * @param {Function} real 輸入真實抓取函數
 * @returns {Function} 回傳應使用之抓取函數：opt._fetchers[fetcherKey]為函數時用它，否則用real
 * @example
 *
 * import fetcherOf from './src/fetcherSeam.mjs'
 *
 * let real = async () => 'real'
 * let fake = async () => 'fake'
 * console.log(fetcherOf({ _fetchers: { curl: fake } }, 'curl', real) === fake, fetcherOf({}, 'curl', real) === real)
 * // => true true
 *
 */
function fetcherOf(opt, fetcherKey, real) {
    let fs = opt?._fetchers
    if (isobj(fs) && isfun(fs[fetcherKey])) {
        return fs[fetcherKey]
    }
    return real
}


export default fetcherOf
