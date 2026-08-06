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
let htmlChallenge = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Just a moment</title></head>
<body><div id="wrap">Checking your browser before accessing the site. This process is automatic. Your browser will redirect shortly.</div></body>
</html>`


//404頁
let htmlNotFound = `<!DOCTYPE html><html><head><title>Not Found</title></head><body><p>not found</p></body></html>`


/**
 * 啟動本機測試用HTTP伺服器
 *
 * 提供路由：
 * /article 回200正常文章頁；
 * /short 回200內容過短頁；
 * /challenge 回200 Cloudflare挑戰頁；
 * 其餘回404
 *
 * @returns {Promise} 回傳Promise，resolve回傳{port,url,close}物件，其中url為由路徑組出完整網址之函數，close為關閉伺服器之async函數
 */
function serverForTest() {
    return new Promise((resolve) => {

        let server = http.createServer((req, res) => {

            let pathname = (req.url || '').split('?')[0]
            let send = (code, body) => {
                res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(body)
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

            send(404, htmlNotFound)
        })

        server.listen(0, '127.0.0.1', () => {
            let port = server.address().port
            resolve({
                port,
                url: (pathname) => `http://127.0.0.1:${port}${pathname}`,
                close: () => new Promise((resolve) => {
                    server.close(() => {
                        resolve(true)
                    })
                }),
            })
        })

    })
}


export { MARKER, htmlArticle, htmlShort, htmlChallenge, htmlNotFound }
export default serverForTest
