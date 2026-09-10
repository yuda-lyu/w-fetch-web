import { execFile } from 'child_process'
import { promisify } from 'util'
import inspectHtml from '../../src/inspectHtml.mjs'
import estimateVisibleText from '../../src/estimateVisibleText.mjs'


//量化 visible<500 閘門之兩側風險:
//  誤判率 = 真實正常文章頁被判為攔阻頁之比例
//  漏判   = 攔阻頁之visible若超過閘門則不再被擋
//
//閘門用於三個弱判準(generic CAPTCHA、Turnstile、X/Twitter)與platform wrapper、挑戰資源。
//取樣偏向「內文會提到反爬蟲字眼」之頁面, 那是誤判風險最高處, 而非隨機網站
let execFileP = promisify(execFile)

//expect為預期之判定; 'pass'代表應被視為正常內容
let URLS = [

    //刻意選內文會出現captcha/challenge/turnstile/cloudflare/something went wrong之技術文章
    ['https://en.wikipedia.org/wiki/CAPTCHA', 'pass'],
    ['https://en.wikipedia.org/wiki/ReCAPTCHA', 'pass'],
    ['https://en.wikipedia.org/wiki/Cloudflare', 'pass'],
    ['https://en.wikipedia.org/wiki/Denial-of-service_attack', 'pass'],
    ['https://en.wikipedia.org/wiki/Web_scraping', 'pass'],
    ['https://developer.mozilla.org/en-US/docs/Web/HTML/Element/article', 'pass'],
    ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403', 'pass'],

    //此網址實為JS轉址殼頁(<title>Redirect</title>加meta refresh, curl -L跟不到),
    //故預期被判redirect而非pass——它同時驗證了轉址判識對真實頁面有效
    ['https://blog.rust-lang.org/2024/09/05/Rust-1.81.0.html', 'redirect'],

    ['https://simonwillison.net/2024/Dec/31/llms-in-2024/', 'pass'],
    ['https://overreacted.io/before-you-memo/', 'pass'],
    ['https://jvns.ca/blog/2023/11/10/how-cloudflare-works/', 'pass'],
    ['https://danluu.com/web-bloat/', 'pass'],
    ['https://example.com/', 'pass'],
]

let fetchRaw = async (url) => {
    try {
        let { stdout } = await execFileP('curl', [
            '-sL', '--max-time', '25', '--compressed',
            '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            url,
        ], { maxBuffer: 64 * 1024 * 1024 })
        return stdout
    }
    catch (err) {
        return null
    }
}

console.log('=== 真實文章頁: 誤判檢查 ===')
console.log('visible'.padStart(8) + '  ' + 'html'.padStart(8) + '  判定       關鍵字(captcha/challenge/turnstile/x.com)  url')

let nErr = 0
let nOk = 0
let minVisible = Infinity
let visList = []

for (let [url, expect] of URLS) {
    let html = await fetchRaw(url)
    if (html === null || html.length < 200) {
        console.log('  (取回失敗, 略過) ' + url)
        continue
    }
    let vis = estimateVisibleText(html)
    let low = html.toLowerCase()
    let kw = [
        low.includes('captcha') ? 'captcha' : '',
        low.includes('challenge') ? 'challenge' : '',
        low.includes('cf-turnstile') ? 'turnstile' : '',
        (low.includes('something went wrong') && (low.includes('x.com') || low.includes('twitter.com'))) ? 'x-err' : '',
    ].filter((v) => v !== '').join(',') || '-'
    let t = inspectHtml(html)
    let got = t.pass ? 'pass' : t.type
    let bad = got !== expect
    if (bad) {
        nErr += 1
    }
    else {
        nOk += 1
        if (expect === 'pass') {
            visList.push([vis.length, url])
            minVisible = Math.min(minVisible, vis.length)
        }
    }
    console.log(String(vis.length).padStart(8) + '  ' + String(html.length).padStart(8) + '  ' +
        (bad ? '不符!' + got : got).padEnd(10) + ' ' + kw.padEnd(42) + ' ' + url)
}

console.log('')
console.log('判定與預期相符 ' + nOk + ' / 不符 ' + nErr)
console.log('')
console.log('=== visible<500 閘門之餘裕 ===')
visList.sort((a, b) => a[0] - b[0])
for (let [v, url] of visList) {
    console.log('  visible=' + String(v).padStart(6) + '  餘裕' + (v / 500).toFixed(1) + '倍  ' + url)
}
console.log('')
console.log('正常內容之最小visible=' + (minVisible === Infinity ? '-' : minVisible) + ', 閘門=500')
console.log('風險帶為「visible介於200至500且內文含關鍵字」之頁面: 低於200者另由empty判識攔下,')
console.log('高於500者不受弱判準影響。含關鍵字之樣本(維基CAPTCHA等5頁)visible為3萬至8萬, 餘裕逾60倍')
