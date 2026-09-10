import serverForTest from './serverForTest.mjs'


/**
 * 於當前describe內註冊測試用HTTP server之啟動與關閉
 *
 * 僅供「單純起server、無其他前置條件」之測試檔使用。
 * 凡before內另有Chrome探測或skip判斷者一律不得改用本函數——
 * 探測與skip的先後順序本身即為該檔之測試意圖(例如須在起server前先skip以免留下未關閉的server),
 * 抽成共用hook會使該順序隱形而難以察覺被改動
 *
 * server於before非同步啟動, 故回傳者為代理物件而非server本身,
 * 其url與nCount500皆於呼叫時才轉發至實際server, 可直接於it內使用
 *
 * @returns {Object} 回傳{url,nCount500,port}代理物件，url為由路徑組出完整網址之函數，nCount500為取得500次數之函數，port為監聽埠號
 * @example
 *
 * import useServer from './tools/useServer.mjs'
 *
 * describe('someFetcher', function() {
 *     let svr = useServer()
 *     it('抓取正常網頁', async function() {
 *         let t = await fetchWeb(svr.url('/article'))
 *     })
 * })
 *
 */
function useServer() {

    let _svr = null

    before(async function() {
        _svr = await serverForTest()
    })

    after(async function() {
        if (_svr) {
            await _svr.close()
        }
    })

    return {
        url: (pathname) => _svr.url(pathname),
        nCount500: () => _svr.nCount500(),
        lastHeaders: (pathname) => _svr.lastHeaders(pathname),
        get port() {
            return _svr?.port
        },
    }
}


export default useServer
