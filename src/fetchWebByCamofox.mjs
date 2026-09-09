import delay from 'wsemi/src/delay.mjs'
import getUrlErrorResult from './getUrlErrorResult.mjs'
import { fetchedAtIso } from './fetchedAt.mjs'
import getRetryWaitMs, { DEFAULT_MAX_RETRIES } from './getRetryWaitMs.mjs'
import resolveCamofoxServer from './resolveCamofoxServer.mjs'
import snapshotToHtml from './snapshotToHtml.mjs'
import runCamofoxAttempt from './runCamofoxAttempt.mjs'
import { getOptPInt, getOptP0Int } from './getOpt.mjs'
import { METHOD_CAMOFOX as METHOD } from './constants.mjs'


//預設值
let DEFAULT_PORT = 19377
let DEFAULT_SERVER_START_TIMEOUT_MS = 30000
let DEFAULT_SNAPSHOT_RETRIES = 3
let DEFAULT_SNAPSHOT_WAIT_MS = 5000
let SNAPSHOT_MIN_CHARS = 50


/**
 * 使用Camofox反偵測瀏覽器抓取網頁原始HTML，透過accessibility snapshot取得內容
 *
 * 流程：
 * 以Node模組解析機制取得已安裝之@askjo/camofox-browser之server.js位置；
 * spawn `node <server.js>` 啟動Camofox server；
 * POST /tabs 建立tab；
 * GET /tabs/:id/snapshot 取accessibility snapshot(含內部重試)；
 * DELETE /tabs/:id 關閉tab；
 * 殺整棵server進程樹(Windows用taskkill /F /T，Unix以負PID對spawn時建立之行程群組送SIGTERM)
 *
 * 對server之每次HTTP請求皆有15秒硬上限，逾時即abort，不因server無回應而永久等待；
 * 單次嘗試之server啟動與清理皆由runCamofoxAttempt完成，故重試退避期間不會佔用該埠
 *
 * 該套件之server.js無任何export且於top-level即無條件listen，故只能spawn為子行程執行，
 * 不可直接import；解析不到安裝位置時回傳reason='camofox-not-found'
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.port=19377] 輸入Camofox server監聽埠號整數，預設19377
 * @param {Integer} [opt.serverStartTimeoutMs=30000] 輸入等待Camofox server啟動最長毫秒整數，預設30000
 * @param {Integer} [opt.snapshotRetries=3] 輸入snapshot內容不足時之重取次數整數，預設3
 * @param {Integer} [opt.snapshotWaitMs=5000] 輸入snapshot重取間隔毫秒整數，預設5000
 * @param {Integer} [opt.maxRetries=5] 輸入失敗時最大重試次數整數，含初始共執行maxRetries+1次，預設5
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，成功時為{status:'success',url,html,htmlLength,contentKind,snapshot,snapshotChars,method,fetchedAt,attempts}（contentKind恆為'synthesized'，因內容由accessibility snapshot合成），失敗時為{status:'error',url,message,reason,method,fetchedAt,attempts}，本函數不會reject
 * @example
 *
 * import fetchWebByCamofox from './src/fetchWebByCamofox.mjs'
 *
 * let test = async () => {
 *
 *     let r = await fetchWebByCamofox('https://mp.weixin.qq.com/s/xxxxxx')
 *     console.log(r.status, r.snapshotChars, r.htmlLength)
 *     // => 'success' 3215 4102
 *
 *     let re = await fetchWebByCamofox('abc')
 *     console.log(re.status, re.reason)
 *     // => 'error' 'invalid-url'
 *
 * }
 * await test()
 *     .catch((err) => {
 *         console.log(err)
 *     })
 *
 */
async function fetchWebByCamofox(url, opt = {}) {

    //fetchedAt
    let fetchedAt = fetchedAtIso()

    //check url
    let rErr = getUrlErrorResult(url, METHOD, fetchedAt)
    if (rErr) {
        return rErr
    }

    //camofoxServer
    let camofoxServer = resolveCamofoxServer()
    if (!camofoxServer) {
        return {
            status: 'error',
            url,
            message: '@askjo/camofox-browser not installed (npm install @askjo/camofox-browser)',
            reason: 'camofox-not-found',
            method: METHOD,
            fetchedAt,
            attempts: 0,
        }
    }

    //port
    let port = getOptPInt(opt, 'port', DEFAULT_PORT)

    //serverStartTimeoutMs
    let serverStartTimeoutMs = getOptPInt(opt, 'serverStartTimeoutMs', DEFAULT_SERVER_START_TIMEOUT_MS)

    //snapshotRetries
    let snapshotRetries = getOptP0Int(opt, 'snapshotRetries', DEFAULT_SNAPSHOT_RETRIES)

    //snapshotWaitMs
    let snapshotWaitMs = getOptP0Int(opt, 'snapshotWaitMs', DEFAULT_SNAPSHOT_WAIT_MS)

    //maxRetries
    let maxRetries = getOptP0Int(opt, 'maxRetries', DEFAULT_MAX_RETRIES)

    let lastMessage = ''
    let lastReason = 'camofox-error'

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {

        //單次嘗試自行擁有server之生命週期, 回傳時資源已釋放, 故退避期間不會有殘留server佔用埠
        let r = await runCamofoxAttempt(url, {
            camofoxServer,
            port,
            serverStartTimeoutMs,
            snapshotRetries,
            snapshotWaitMs,
            snapshotMinChars: SNAPSHOT_MIN_CHARS,
        })

        if (r.ok) {
            let pageTitle = r.snapshot.match(/heading\s+"(.+?)"\s*\[level=1\]/)?.[1] || ''
            let html = snapshotToHtml(r.snapshot, pageTitle)
            return {
                status: 'success',
                url,
                html,
                htmlLength: html.length,
                contentKind: 'synthesized',
                snapshot: r.snapshot,
                snapshotChars: r.snapshotChars,
                method: METHOD,
                fetchedAt,
                attempts: attempt,
            }
        }

        lastMessage = r.message
        lastReason = r.reason

        if (attempt <= maxRetries) {
            let ms = getRetryWaitMs(attempt)
            process.stderr.write(`[fetchWebByCamofox] error: ${lastMessage}，等 ${ms}ms 後重試 (${attempt}/${maxRetries})
`)
            await delay(ms)
            continue
        }

        return {
            status: 'error',
            url,
            message: lastMessage,
            reason: lastReason,
            method: METHOD,
            fetchedAt,
            attempts: attempt,
        }
    }
}


export { snapshotToHtml }
export default fetchWebByCamofox
