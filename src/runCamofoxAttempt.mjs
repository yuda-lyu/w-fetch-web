import { execFileSync, spawn } from 'child_process'
import { dirname } from 'path'
import isstr from 'wsemi/src/isstr.mjs'
import delay from 'wsemi/src/delay.mjs'


let IS_WIN = process.platform === 'win32'

//單次HTTP請求之硬上限, 使server啟動與tab對話不致無限等待
let FETCH_TIMEOUT_MS = 15000

//snapshot內容達此字數即視為足夠, 不再重取
let SNAPSHOT_ENOUGH_CHARS = 200


//殺整棵進程樹
//Windows以taskkill /T殺樹; Unix則須先於spawn時detached建立行程群組, 再以負PID對整群送SIGTERM,
//否則只殺得到直接子行程而留下瀏覽器等後代。兩者皆失敗時退回只殺直接子行程
function killProcessTree(proc, deps = {}) {

    if (!proc || proc.killed) {
        return
    }

    let execSync = deps.execFileSync || execFileSync
    let killPid = deps.killPid || ((pid, sig) => process.kill(pid, sig))
    let isWin = deps.isWin === undefined ? IS_WIN : deps.isWin

    if (isWin) {
        try {
            execSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore', timeout: 5000 })
            return
        }
        catch {}
    }
    else {
        try {

            //負PID代表對整個行程群組送訊號
            killPid(-proc.pid, 'SIGTERM')
            return
        }
        catch {}
    }

    //最後手段: 只殺直接子行程
    try {
        proc.kill('SIGTERM')
    }
    catch {}
}


//帶硬上限之fetch, 逾時即abort
function _fetchTimeout(url, opt = {}) {
    return fetch(url, { ...opt, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}


//輪詢等待Camofox server啟動完成
async function _waitReady(base, maxMs) {
    let start = Date.now()
    while (Date.now() - start < maxMs) {
        try {
            let r = await _fetchTimeout(base + '/tabs')
            if (r.ok) {
                return true
            }
        }
        catch {}
        await delay(300)
    }
    return false
}


//與已就緒之server進行tab對話: 建立tab、重取snapshot至足量、關閉tab
//取得tabId後即以try/finally保證DELETE, 不因中途失敗而遺留tab
async function _runSession(base, url, cfg) {

    let createRes = await _fetchTimeout(base + '/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'fetchWebByCamofox', sessionKey: 's-' + Date.now(), url }),
    })
    let createJson = await createRes.json().catch(() => ({}))
    let tabId = createJson?.tabId
    if (!tabId) {
        return { ok: false, reason: 'camofox-error', message: 'tab creation failed: ' + (createJson?.error || createJson?.message || 'no tabId') }
    }

    let snap = null
    let chars = 0

    //記錄最後一次請求失敗之原因: 傳輸失敗與「頁面真的沒內容」是兩回事,
    //前者該重試、後者重試也沒用, 混報為camofox-empty會使呼叫端無從分辨
    let lastErr = null
    try {
        for (let i = 0; i <= cfg.snapshotRetries; i++) {
            try {
                let snapRes = await _fetchTimeout(base + '/tabs/' + tabId + '/snapshot?userId=fetchWebByCamofox')
                snap = await snapRes.json().catch(() => null)
                chars = (snap && snap.totalChars) || 0
                if (chars > SNAPSHOT_ENOUGH_CHARS) {
                    break
                }
            }
            catch (err) {
                lastErr = err
            }
            if (i < cfg.snapshotRetries) {
                process.stderr.write(`[fetchWebByCamofox] snapshot ${i + 1} only ${chars} chars, waiting ${cfg.snapshotWaitMs}ms...\n`)
                await delay(cfg.snapshotWaitMs)
            }
        }
    }
    finally {
        await _fetchTimeout(base + '/tabs/' + tabId + '?userId=fetchWebByCamofox', { method: 'DELETE' }).catch(() => {})
    }

    //從未取得任何回應且有請求錯誤: 屬傳輸層失敗而非內容為空
    if (snap === null && lastErr !== null) {
        return { ok: false, reason: 'camofox-error', message: 'snapshot request failed: ' + (lastErr?.message || String(lastErr)) }
    }

    if (!snap || chars < cfg.snapshotMinChars || !isstr(snap.snapshot)) {
        return { ok: false, reason: 'camofox-empty', message: `camofox snapshot empty (${chars} chars)` }
    }

    return { ok: true, snapshot: snap.snapshot, snapshotChars: chars }
}


/**
 * 執行一次完整的Camofox抓取嘗試
 *
 * 本函數擁有單次嘗試的**完整資源生命週期**：spawn server、等待就緒、進行tab對話、
 * 並於回傳前必定殺掉整棵server進程樹。
 *
 * 資源必須在本函數回傳前釋放，呼叫端才可以安全地進入重試退避——
 * 若把清理留給呼叫端的finally，退避的3至15秒期間server與其佔用的埠會繼續存活
 *
 * @param {String} url 輸入待抓取網址字串
 * @param {Object} cfg 輸入設定物件
 * @param {String} cfg.camofoxServer 輸入Camofox server之server.js絕對路徑字串
 * @param {Integer} cfg.port 輸入server監聽埠號整數
 * @param {Integer} cfg.serverStartTimeoutMs 輸入等待server就緒最長毫秒整數
 * @param {Integer} cfg.snapshotRetries 輸入snapshot內容不足時之重取次數整數
 * @param {Integer} cfg.snapshotWaitMs 輸入snapshot重取間隔毫秒整數
 * @param {Integer} cfg.snapshotMinChars 輸入snapshot最低有效字數整數
 * @returns {Promise} 回傳Promise，resolve回傳{ok:true,snapshot,snapshotChars}或{ok:false,reason,message}，本函數不會reject
 */
async function runCamofoxAttempt(url, cfg) {

    let base = 'http://localhost:' + cfg.port
    let serverProc = null

    try {

        //啟動Camofox server, cwd須為套件目錄, 其camofox.config.json等設定由該處讀取
        //非Windows另以detached建立行程群組, 使清理時可對整群送訊號
        serverProc = spawn('node', [cfg.camofoxServer], {
            cwd: dirname(cfg.camofoxServer),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, CAMOFOX_PORT: String(cfg.port) },
            windowsHide: true,
            detached: !IS_WIN,
        })
        serverProc.stderr.on('data', () => {})
        serverProc.stdout.on('data', () => {})

        if (!(await _waitReady(base, cfg.serverStartTimeoutMs))) {
            return { ok: false, reason: 'camofox-error', message: 'camofox server failed to start within ' + (cfg.serverStartTimeoutMs / 1000) + 's' }
        }

        return await _runSession(base, url, cfg)
    }
    catch (err) {
        return { ok: false, reason: 'camofox-error', message: err?.message || String(err) }
    }
    finally {

        //清理必須在本函數回傳前完成, 不可留給呼叫端的重試迴圈
        if (serverProc) {
            killProcessTree(serverProc)
            await delay(500)
        }
    }
}


export { killProcessTree }
export default runCamofoxAttempt
