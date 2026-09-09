import http from 'http'


/**
 * 啟動假的Camofox server
 *
 * fetchWebByCamofox會spawn真實camofox server並以HTTP與之溝通。本假server先佔住該埠，
 * 使_waitCamofoxReady立即通過；真實server因EADDRINUSE而立即退出，後續所有HTTP請求皆由本假server應答。
 * 藉此可在不啟動真實反偵測瀏覽器的前提下，驅動建立tab、取snapshot、關閉tab之完整流程
 *
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Array} [opt.snapshots=[]] 輸入依序回傳之snapshot回應陣列，用盡則沿用最後一個
 * @param {String} [opt.tabId='tab-1'] 輸入建立tab時回傳之tabId字串，預設'tab-1'
 * @param {Boolean} [opt.failCreate=false] 輸入建立tab是否失敗布林值，預設false
 * @param {Boolean} [opt.notReady=false] 輸入就緒探測是否一律回500布林值，用於驅動server未就緒分支，預設false
 * @param {Integer} [opt.port=0] 輸入監聽埠號整數，0代表由系統指派，預設0
 * @returns {Promise} 回傳Promise，resolve回傳{port,requests,close}物件
 */
function camofoxServerFake(opt = {}) {
    return new Promise((resolve) => {

        let snapshots = opt.snapshots || []
        let tabId = opt.tabId || 'tab-1'
        let failCreate = opt.failCreate === true
        let notReady = opt.notReady === true
        let requests = []
        let iSnap = 0

        let server = http.createServer((req, res) => {

            let pathname = (req.url || '').split('?')[0]
            requests.push(req.method + ' ' + pathname)

            let send = (code, obj) => {
                res.writeHead(code, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(obj))
            }

            //就緒探測
            if (req.method === 'GET' && pathname === '/tabs') {

                //notReady時一律回500, 使_waitCamofoxReady之r.ok為false而持續輪詢至逾時;
                //同時因本假server已佔住該埠, 真實camofox server亦無法綁定
                if (notReady) {
                    send(500, { error: 'starting' })
                    return
                }
                send(200, [])
                return
            }

            //建立tab
            if (req.method === 'POST' && pathname === '/tabs') {

                //須讀完request body, 否則連線不會結束
                req.resume()
                if (failCreate) {
                    send(200, { error: 'browser launch failed' })
                    return
                }
                send(200, { tabId })
                return
            }

            //取snapshot
            if (req.method === 'GET' && /^\/tabs\/[^/]+\/snapshot$/.test(pathname)) {
                let s = snapshots[Math.min(iSnap, snapshots.length - 1)]
                iSnap += 1
                send(200, s || {})
                return
            }

            //關閉tab
            if (req.method === 'DELETE' && /^\/tabs\/[^/]+$/.test(pathname)) {
                send(200, { ok: true })
                return
            }

            send(404, { error: 'not found' })
        })

        //不指定host以同時涵蓋localhost解析為127.0.0.1與::1之情形
        //port給0代表由系統指派, 給定值則綁該埠(用於驗證受測端之預設埠)
        server.listen(opt.port || 0, () => {
            resolve({
                port: server.address().port,
                requests,
                close: () => new Promise((resolve) => {
                    server.close(() => {
                        resolve(true)
                    })
                }),
            })
        })

    })
}


export default camofoxServerFake
