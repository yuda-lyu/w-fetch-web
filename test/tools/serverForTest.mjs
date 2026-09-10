import http from 'http'


//測試用內文標記, 供斷言抓取內容確實來自本機測試網頁
let MARKER = 'WFETCHWEB-TEST-MARKER'


//正常文章頁, 內文足供Readability解析
let htmlArticle = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>W Fetch Web Test Article</title></head>
<body>
<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
<article>
<h1>W Fetch Web Test Article</h1>
<p>${MARKER}, this first paragraph exists so that the extracted article body can be asserted precisely, and it is deliberately long enough, with several commas, so that the readability scoring algorithm treats it as real body text rather than boilerplate.</p>
<p>The second paragraph continues the same discussion, adding more sentences, more commas, and more length, because a readability parser needs a reasonable amount of textual material before it is willing to select a container as the main article body of the page.</p>
<p>The third paragraph closes the article, restating that this document is only a fixture served by a local test server, that it contains no captcha wording, no challenge wording, and no redirect wrapper markup of any kind whatsoever.</p>
</article>
<footer><p>copyright test</p></footer>
</body>
</html>`


//內容過短頁, 供斷言empty-response
let htmlShort = 'hi'


//Cloudflare挑戰頁, 內容補長以通過curl之最短長度檢核, 供斷言inspectHtml攔截
//標題採真實形狀「Just a moment...」(含刪節號)而非實作恰好比對得到的形狀:
//原fixture寫成無刪節號之「Just a moment」, 是照實作寫而非照真實頁面寫,
//故判識器改用全等比對而漏判真實頁面時, 測試依然全綠
let htmlChallenge = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Just a moment...</title></head>
<body><div id="wrap">Checking your browser before accessing the site. This process is automatic. Your browser will redirect shortly.</div></body>
</html>`


//404頁
let htmlNotFound = `<!DOCTYPE html><html><head><title>Not Found</title></head><body><p>not found</p></body></html>`


//內嵌__NEXT_DATA__但可見文字極少之頁面
//html長度>5000且可見文字<200, inspectHtml會判為empty, 用於驗證inspect開關
let htmlNextData = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Article</title></head>` +
    `<body><div id="__next"></div>` +
    `<script id="__NEXT_DATA__" type="application/json">{"body":"${'x'.repeat(8000)}"}</script>` +
    `</body></html>`


//Cloudflare驗證頁(模式A): iframe之src屬性含challenges.cloudflare.com, 可被選取器直接命中
//src指向本機資源, 不對外連線
let htmlCfIframe = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Attention Required</title></head>` +
    `<body><h1>Please verify</h1>` +
    `<iframe src="/blank?challenges.cloudflare.com" width="300" height="65" style="display:block"></iframe>` +
    `</body></html>`


//Cloudflare驗證頁(模式B, 有容器): iframe之src屬性留空改由JS導航, 且不置於.cf-turnstile內,
//故模式A之四個選取器皆不命中, 僅page.frames()之url含該字串;
//另置#turnstile-container供managed challenge分支取得boundingBox
let htmlCfManaged = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Attention Required</title></head>` +
    `<body><h1>Please verify</h1>` +
    `<div id="turnstile-container" style="width:300px;height:65px;background:#eee"></div>` +
    `<iframe id="f" width="300" height="65"></iframe>` +
    `<script>document.getElementById('f').contentWindow.location.replace('/blank?challenges.cloudflare.com')</script>` +
    `</body></html>`


//Cloudflare驗證頁(模式B, 無容器): 同上但不提供任何容器,
//用以驅動boundingBox為null而改以視窗比例座標點擊之分支
let htmlCfManagedNoBox = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Attention Required</title></head>` +
    `<body><h1>Please verify</h1>` +
    `<iframe id="f" width="300" height="65"></iframe>` +
    `<script>document.getElementById('f').contentWindow.location.replace('/blank?challenges.cloudflare.com')</script>` +
    `</body></html>`


//iframe之內容頁
let htmlBlank = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>b</title></head><body><p>blank</p></body></html>`


//長篇簡體中文攔阻頁: 使用端判識器機制之動機情境
//
//此頁刻意兼具三個性質, 缺一則測不到該機制存在的理由:
//  一、內建判識器全數漏判——關鍵字皆為英文, 此頁一個都不含
//  二、可見文字遠超EMPTY_VISIBLE_MAX, 故empty這道兜底也攔不下(攔阻頁文案一長即如此)
//  三、可見文字亦超過SPARSE_VISIBLE_MAX, 故若對使用端判識器套內容量閘門, 註冊了也不會被比對
//文案取自實測所見之樣板措辭, 重複至長度落在上述帶內
let htmlCnChallenge = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>安全验证</title></head>` +
    `<body><div class="sec-container"><p>` +
    '正在进行安全检测，为保障您的访问安全，系统需要检测当前网络环境，该过程通常需要几秒钟，请耐心等待并不要关闭此页面。'.repeat(12) +
    `</p></div></body></html>`


/**
 * 啟動本機測試用HTTP伺服器
 *
 * 提供路由：
 * /article 回200正常文章頁；
 * /cfchallenge 回200 Cloudflare驗證頁(iframe選取器可命中)；
 * /cfmanaged 回200 Cloudflare managed challenge頁(僅frames之url命中, 有容器)；
 * /cfmanaged-nobox 回200同上但無容器；
 * /blank 回200 iframe內容頁；
 * /short 回200內容過短頁；
 * /challenge 回200 Cloudflare挑戰頁；
 * /nextdata 回200內嵌__NEXT_DATA__但可見文字極少之頁面；
 * /cnchallenge 回200長篇簡體中文攔阻頁(內建判識器全數漏判)；
 * /error500 回500可重試錯誤；
 * /count500 回500可重試錯誤並計次，供斷言實際重試次數；
 * 其餘回404
 *
 * @returns {Promise} 回傳Promise，resolve回傳{port,url,nCount500,lastHeaders,close}物件，其中url為由路徑組出完整網址之函數，nCount500為取得500次數之函數，lastHeaders為依路徑取得最後一次請求標頭之函數(預設'/article')，close為關閉伺服器之async函數
 */
function serverForTest() {
    return new Promise((resolve) => {

        //供 /count500 計數
        let nCount500 = 0

        //記錄各路徑最後一次收到的請求標頭, 用於驗證HTTP請求身分是否確實送出
        //
        //須依路徑分別記錄而非只留「最後一次」: 瀏覽器載入頁面後會自動再請求/favicon.ico,
        //其Referer為該頁自身網址, 會蓋掉主文件的標頭而使斷言看到錯誤的值
        let headersByPath = {}

        let server = http.createServer((req, res) => {

            let pathname = (req.url || '').split('?')[0]
            let send = (code, body) => {
                res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(body)
            }

            headersByPath[pathname] = {
                userAgent: req.headers['user-agent'] || '',
                referer: req.headers.referer || '',
                acceptLanguage: req.headers['accept-language'] || '',
            }

            if (pathname === '/article') {
                send(200, htmlArticle)
                return
            }
            if (pathname === '/short') {
                send(200, htmlShort)
                return
            }
            if (pathname === '/challenge') {
                send(200, htmlChallenge)
                return
            }
            if (pathname === '/nextdata') {
                send(200, htmlNextData)
                return
            }
            if (pathname === '/cfchallenge') {
                send(200, htmlCfIframe)
                return
            }
            if (pathname === '/cfmanaged') {
                send(200, htmlCfManaged)
                return
            }
            if (pathname === '/cfmanaged-nobox') {
                send(200, htmlCfManagedNoBox)
                return
            }
            if (pathname === '/blank') {
                send(200, htmlBlank)
                return
            }
            if (pathname === '/cnchallenge') {
                send(200, htmlCnChallenge)
                return
            }
            if (pathname === '/error500') {
                send(500, htmlNotFound)
                return
            }

            //計數用之500路由: 每次請求遞增, 供斷言重試次數
            if (pathname === '/count500') {
                nCount500 += 1
                send(500, htmlNotFound)
                return
            }

            send(404, htmlNotFound)
        })

        server.listen(0, '127.0.0.1', () => {
            let port = server.address().port
            resolve({
                port,
                url: (pathname) => `http://127.0.0.1:${port}${pathname}`,
                nCount500: () => nCount500,
                lastHeaders: (pathname = '/article') => headersByPath[pathname] || null,
                close: () => new Promise((resolve) => {
                    server.close(() => {
                        resolve(true)
                    })
                }),
            })
        })

    })
}


export { MARKER, htmlArticle, htmlShort, htmlChallenge, htmlNotFound, htmlNextData, htmlCfIframe, htmlCfManaged, htmlCfManagedNoBox, htmlBlank, htmlCnChallenge }
export default serverForTest
