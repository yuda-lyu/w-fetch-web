import w from 'wsemi'
import wi from './src/WFetchWeb.mjs'


let test = async () => {

    let url = 'https://example.com/'

    //auto模式, 自動由curl起階梯升級, 並以Readability解析出標題與內文
    let r1 = await wi.fetchWeb(url)
    console.log('auto+parse:', r1.status, r1.method, r1.title, r1.contentLength)
    // => auto+parse: success curl Example Domain 111

    //不解析, 直接取原始HTML
    let r2 = await wi.fetchWeb(url, { parse: false })
    console.log('auto+html:', r2.status, r2.method, r2.html.length)
    // => auto+html: success curl 559

    //指定抓取方法, 並關閉階梯升級過程訊息
    await w.pmSeries(['curl', 'playwright'], async (method) => {
        let r = await wi.fetchWeb(url, { method, showLog: false })
        console.log('method=' + method + ':', r.status, r.method, r.contentLength)
        // => method=curl: success curl 111
        // => method=playwright: success playwright-headless 125
    })

    //直接呼叫單一抓取方法, 回傳原始HTML不解析
    let r3 = await wi.fetchWebByCurl(url)
    console.log('byCurl:', r3.status, r3.httpCode, r3.htmlLength, r3.attempts)
    // => byCurl: success 200 559 1

    //失敗時回傳error結果物件, 不會reject
    let r4 = await wi.fetchWeb('abc')
    console.log('invalid:', r4.status, r4.message)
    // => invalid: error invalid url (must be http/https)

}
await test()
    .catch((err) => {
        console.log(err)
    })


//node g.mjs
