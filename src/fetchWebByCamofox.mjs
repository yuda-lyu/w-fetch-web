import { execFileSync, spawn } from 'child_process'
import { dirname } from 'path'
import get from 'lodash-es/get.js'
import isstr from 'wsemi/src/isstr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isp0int from 'wsemi/src/isp0int.mjs'
import cint from 'wsemi/src/cint.mjs'
import delay from 'wsemi/src/delay.mjs'
import getUrlErrorResult from './getUrlErrorResult.mjs'
import getRetryWaitMs from './getRetryWaitMs.mjs'
import resolveCamofoxServer from './resolveCamofoxServer.mjs'


//方法名稱
let METHOD = 'camofox'

//預設值
let DEFAULT_MAX_RETRIES = 5
let DEFAULT_PORT = 19377
let DEFAULT_SERVER_START_TIMEOUT_MS = 30000
let DEFAULT_SNAPSHOT_RETRIES = 3
let DEFAULT_SNAPSHOT_WAIT_MS = 5000
let SNAPSHOT_MIN_CHARS = 50
let IS_WIN = process.platform === 'win32'


//Windows殺整棵進程樹, Unix用SIGTERM
function _killProcessTree(proc) {

    if (!proc || proc.killed) {
        return
    }

    if (IS_WIN) {
        try {
            execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore', timeout: 5000 })
        }
        catch {
            try {
                proc.kill()
            }
            catch {}
        }
    }
    else {
        try {
            proc.kill('SIGTERM')
        }
        catch {}
    }
}


//輪詢等待Camofox server啟動完成
async function _waitCamofoxReady(base, maxMs) {
    let start = Date.now()
    while (Date.now() - start < maxMs) {
        try {
            let r = await fetch(base + '/tabs')
            if (r.ok) {
                return true
            }
        }
        catch {}
        await delay(300)
    }
    return false
}


/**
 * 將Camofox之accessibility snapshot轉換為簡易HTML
 *
 * 保留heading、paragraph、listitem、strong、emphasis、text、img等語意元素，跳過button、
 * banner、navigation等結構容器標記
 *
 * @param {String} snapshot 輸入accessibility snapshot字串
 * @param {String} [pageTitle=''] 輸入頁面標題字串，預設''
 * @returns {String} 回傳簡易HTML字串
 * @example
 *
 * import { snapshotToHtml } from './src/fetchWebByCamofox.mjs'
 *
 * console.log(snapshotToHtml('- heading "abc" [level=1]\n- paragraph: def', 'abc'))
 * // => '<!DOCTYPE html><html><head><title>abc</title></head><body><article><h1>abc</h1>\n<h1>abc</h1>\n<p>def</p></article></body></html>'
 *
 */
function snapshotToHtml(snapshot, pageTitle = '') {

    //check
    if (!isstr(snapshot)) {
        snapshot = ''
    }
    if (!isstr(pageTitle)) {
        pageTitle = ''
    }

    let esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let lines = snapshot.split('\n')
    let htmlParts = []

    for (let line of lines) {

        let trimmed = line.replace(/^ *- */, '').trim()
        if (!trimmed) {
            continue
        }

        //heading "..." [level=N]
        let headingMatch = trimmed.match(/^(?:')?heading\s+"(.+?)"\s*\[level=(\d)\]/)
        if (headingMatch) {
            let lvl = headingMatch[2]
            htmlParts.push(`<h${lvl}>${esc(headingMatch[1])}</h${lvl}>`)
            continue
        }

        //link與/url:皆跳過, 內容由子行處理
        if (/^(?:')?link\s+"/.test(trimmed)) {
            continue
        }
        if (/^\/url:\s+/.test(trimmed)) {
            continue
        }

        //img "alt"
        let imgMatch = trimmed.match(/^img\s+"(.+?)"/)
        if (imgMatch) {
            htmlParts.push(`<img alt="${esc(imgMatch[1])}">`)
            continue
        }

        //paragraph與paragraph: text
        let paraMatch = trimmed.match(/^paragraph(?::\s*(.+))?$/)
        if (paraMatch) {
            if (paraMatch[1]) {
                htmlParts.push(`<p>${esc(paraMatch[1])}</p>`)
            }
            continue
        }

        //listitem與listitem: text
        let liMatch = trimmed.match(/^listitem(?::\s*(.+))?$/)
        if (liMatch) {
            if (liMatch[1]) {
                htmlParts.push(`<li>${esc(liMatch[1])}</li>`)
            }
            continue
        }

        //strong: text
        let strongMatch = trimmed.match(/^strong:\s*"?(.+?)"?\s*$/)
        if (strongMatch) {
            htmlParts.push(`<strong>${esc(strongMatch[1])}</strong>`)
            continue
        }

        //emphasis: text
        let emMatch = trimmed.match(/^emphasis:\s*"?(.+?)"?\s*$/)
        if (emMatch) {
            htmlParts.push(`<em>${esc(emMatch[1])}</em>`)
            continue
        }

        //text: "..."
        let textMatch = trimmed.match(/^text:\s*"?(.+?)"?\s*$/)
        if (textMatch) {
            htmlParts.push(`<span>${esc(textMatch[1])}</span>`)
            continue
        }

        //option "..." (微信附註)
        let optionMatch = trimmed.match(/^(?:')?option\s+"(.+?)"/)
        if (optionMatch) {
            htmlParts.push(`<p>${esc(optionMatch[1])}</p>`)
            continue
        }

        //結構與容器標記皆跳過
        if (/^(button|banner|navigation|main|contentinfo|complementary|list)\b/.test(trimmed)) {
            continue
        }

        //純文字行
        let plainText = trimmed.replace(/\[e\d+\]/g, '').replace(/^['"]|['"]$/g, '').trim()
        if (
            plainText.length > 0 &&
            !/^(link|img|heading|paragraph|listitem|strong|emphasis|text|option|button|banner|navigation|main|contentinfo|complementary|list)\b/.test(plainText)
        ) {
            htmlParts.push(`<p>${esc(plainText)}</p>`)
        }
    }

    let titleEsc = esc(pageTitle)
    return (
        '<!DOCTYPE html><html><head><title>' + titleEsc + '</title></head>' +
        '<body><article><h1>' + titleEsc + '</h1>\n' +
        htmlParts.join('\n') +
        '</article></body></html>'
    )
}


/**
 * 使用Camofox反偵測瀏覽器抓取網頁原始HTML，透過accessibility snapshot取得內容
 *
 * 流程：
 * 以Node模組解析機制取得已安裝之@askjo/camofox-browser之server.js位置；
 * spawn `node <server.js>` 啟動Camofox server；
 * POST /tabs 建立tab；
 * GET /tabs/:id/snapshot 取accessibility snapshot(含內部重試)；
 * DELETE /tabs/:id 關閉tab；
 * 殺整棵server進程樹(Windows用taskkill /F /T，Unix用SIGTERM)
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
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，成功時為{status:'success',url,html,htmlLength,snapshot,snapshotChars,method,fetchedAt,attempts}，失敗時為{status:'error',url,message,reason,method,fetchedAt,attempts}，本函數不會reject
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
    let fetchedAt = new Date().toISOString()

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
    let port = get(opt, 'port', null)
    if (!ispint(port)) {
        port = DEFAULT_PORT
    }
    else {
        port = cint(port)
    }

    //serverStartTimeoutMs
    let serverStartTimeoutMs = get(opt, 'serverStartTimeoutMs', null)
    if (!ispint(serverStartTimeoutMs)) {
        serverStartTimeoutMs = DEFAULT_SERVER_START_TIMEOUT_MS
    }
    else {
        serverStartTimeoutMs = cint(serverStartTimeoutMs)
    }

    //snapshotRetries
    let snapshotRetries = get(opt, 'snapshotRetries', null)
    if (!isp0int(snapshotRetries)) {
        snapshotRetries = DEFAULT_SNAPSHOT_RETRIES
    }
    else {
        snapshotRetries = cint(snapshotRetries)
    }

    //snapshotWaitMs
    let snapshotWaitMs = get(opt, 'snapshotWaitMs', null)
    if (!isp0int(snapshotWaitMs)) {
        snapshotWaitMs = DEFAULT_SNAPSHOT_WAIT_MS
    }
    else {
        snapshotWaitMs = cint(snapshotWaitMs)
    }

    //maxRetries
    let maxRetries = get(opt, 'maxRetries', null)
    if (!isp0int(maxRetries)) {
        maxRetries = DEFAULT_MAX_RETRIES
    }
    else {
        maxRetries = cint(maxRetries)
    }

    let base = 'http://localhost:' + port

    let lastMessage = ''
    let lastReason = 'camofox-error'

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        let serverProc = null
        try {

            //啟動Camofox server, cwd須為套件目錄, 其camofox.config.json等設定由該處讀取
            serverProc = spawn('node', [camofoxServer], {
                cwd: dirname(camofoxServer),
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, CAMOFOX_PORT: String(port) },
                windowsHide: true,
            })
            serverProc.stderr.on('data', () => {})
            serverProc.stdout.on('data', () => {})

            if (!(await _waitCamofoxReady(base, serverStartTimeoutMs))) {
                lastMessage = 'camofox server failed to start within ' + (serverStartTimeoutMs / 1000) + 's'
                lastReason = 'camofox-error'
                throw new Error(lastMessage)
            }

            //建立tab
            let createRes = await fetch(base + '/tabs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: 'fetchWebByCamofox', sessionKey: 's-' + Date.now(), url }),
            })
            let createJson = await createRes.json().catch(() => ({}))
            let tabId = createJson?.tabId
            if (!tabId) {
                lastMessage = 'tab creation failed: ' + (createJson?.error || createJson?.message || 'no tabId')
                lastReason = 'camofox-error'
                throw new Error(lastMessage)
            }

            //取snapshot, 內部最多重取snapshotRetries次, 含初始共snapshotRetries+1次
            let snap = null
            let chars = 0
            for (let i = 0; i <= snapshotRetries; i++) {
                try {
                    let snapRes = await fetch(base + '/tabs/' + tabId + '/snapshot?userId=fetchWebByCamofox')
                    snap = await snapRes.json().catch(() => null)
                    chars = (snap && snap.totalChars) || 0
                    if (chars > 200) {
                        break
                    }
                }
                catch {}
                if (i < snapshotRetries) {
                    process.stderr.write(`[fetchWebByCamofox] snapshot ${i + 1} only ${chars} chars, waiting ${snapshotWaitMs}ms...\n`)
                    await delay(snapshotWaitMs)
                }
            }

            //關閉tab
            await fetch(base + '/tabs/' + tabId + '?userId=fetchWebByCamofox', { method: 'DELETE' }).catch(() => {})

            if (!snap || chars < SNAPSHOT_MIN_CHARS || !isstr(snap.snapshot)) {
                lastMessage = `camofox snapshot empty (${chars} chars)`
                lastReason = 'camofox-empty'
                throw new Error(lastMessage)
            }

            //轉換snapshot為HTML
            let pageTitle = snap.snapshot.match(/heading\s+"(.+?)"\s*\[level=1\]/)?.[1] || ''
            let html = snapshotToHtml(snap.snapshot, pageTitle)

            return {
                status: 'success',
                url,
                html,
                htmlLength: html.length,
                snapshot: snap.snapshot,
                snapshotChars: chars,
                method: METHOD,
                fetchedAt,
                attempts: attempt,
            }
        }
        catch (err) {
            if (!lastMessage) {
                lastMessage = err.message || String(err)
            }
            if (attempt <= maxRetries) {
                let ms = getRetryWaitMs(attempt)
                process.stderr.write(`[fetchWebByCamofox] error: ${lastMessage}，等 ${ms}ms 後重試 (${attempt}/${maxRetries})\n`)
                await delay(ms)

                //清掉lastMessage讓下一輪用新的err.message
                lastMessage = ''
                continue
            }
            return {
                status: 'error',
                url,
                message: lastMessage || (err.message || String(err)),
                reason: lastReason || 'camofox-error',
                method: METHOD,
                fetchedAt,
                attempts: attempt,
            }
        }
        finally {
            if (serverProc) {
                _killProcessTree(serverProc)
                await delay(500)
            }
        }
    }

    return { status: 'error', url, message: lastMessage || 'max retries exceeded', reason: lastReason, method: METHOD, fetchedAt, attempts: maxRetries + 1 }
}


export { snapshotToHtml }
export default fetchWebByCamofox
