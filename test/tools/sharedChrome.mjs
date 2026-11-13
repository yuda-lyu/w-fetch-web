import fs from 'fs'
import path from 'path'
import wpw from 'w-playwright'
import './noBrowser.mjs'


//跨行程之啟動鎖: mocha --parallel 下各測試檔在不同行程, w-playwright之登入守門只在同行程內序列化,
//多檔可能同時讀到錯誤密碼次數0而各自啟動。以此鎖使「讀取次數至瀏覽器啟動完成」於全部測試行程間依序進行,
//後一個啟動才讀得到前一個造成之增量(與w-playwright行程內之序列化同一段落)。
//鎖放在 test/_tmp/sharedChrome/(測試之臨時檔), 釋放時刪除鎖檔並嘗試移除該資料夾
let LOCK_DIR = path.resolve('./test/_tmp/sharedChrome')
let LOCK_FILE = path.join(LOCK_DIR, 'launch.lock')
let LOCK_WAIT_MAX_MS = 180000


let isAlive = (pid) => {
    try {
        process.kill(pid, 0)
        return true
    }
    catch (err) {
        return err.code === 'EPERM'
    }
}


let delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


/**
 * 以跨行程之檔案鎖依序執行fn(取得→執行→釋放)
 *
 * 持有者行程已結束之殘留鎖視為可回收。限制: 兩個等待者同時判定同一殘留鎖時, 可能一方刪到另一方新建之鎖
 * (只發生於持有者在持鎖期間異常結束之後)
 *
 * @param {Function} fn 輸入async函數
 * @returns {Promise} 回傳Promise，resolve回傳fn之結果，reject回傳fn之錯誤或等鎖逾時之錯誤
 */
async function withLaunchLock(fn) {
    let t0 = Date.now()
    while (true) {
        try {
            fs.mkdirSync(LOCK_DIR, { recursive: true })
            let fd = fs.openSync(LOCK_FILE, 'wx')
            fs.writeSync(fd, String(process.pid))
            fs.closeSync(fd)
            break
        }
        catch (err) {
            if (err.code !== 'EEXIST' && err.code !== 'ENOENT') {
                throw err
            }
            let pid = NaN
            try {
                pid = Number(fs.readFileSync(LOCK_FILE, 'utf8'))
            }
            catch (e) {}
            if (pid > 0 && !isAlive(pid)) {
                try {
                    fs.unlinkSync(LOCK_FILE)
                }
                catch (e) {}
                continue
            }
            if (Date.now() - t0 > LOCK_WAIT_MAX_MS) {
                throw new Error('sharedChrome: timed out waiting for the cross-process launch lock')
            }
            await delay(200)
        }
    }
    try {
        return await fn()
    }
    finally {
        try {
            fs.unlinkSync(LOCK_FILE)
        }
        catch (e) {}
        //只移除空資料夾(他行程正在用者非空, rmdir即失敗而保留)
        try {
            fs.rmdirSync(LOCK_DIR)
            fs.rmdirSync(path.dirname(LOCK_DIR))
        }
        catch (e) {}
    }
}


/**
 * 同一測試檔共用一個真瀏覽器行程(每檔至多啟動一次)
 *
 * 背景: Windows上Chromium 153起每啟動一個瀏覽器根行程即以無效密碼替目前使用者呼叫一次LogonUser,
 * 10分鐘內10次即鎖住帳號。本套件之runPlaywright每次嘗試各自啟動一次瀏覽器(無注入接縫),
 * 若照常執行, 會啟動真Chrome之5個測試檔原本共約28次。故測試以w-playwright之測試接縫,
 * 使同檔之全部嘗試共用一個瀏覽器行程: 啟動次數由「每次嘗試一次」降為「每檔至多一次」,
 * 且各檔之真啟動以跨行程鎖依序進行(withLaunchLock)。
 *
 * 被替身取代之部分(真實情境與本檔之差異, 讀測試結果時須知):
 * ① 真實為每次嘗試各起一個瀏覽器行程; 此處只有第一次到達替身之嘗試以next()真啟動(w-playwright合併後之選項原樣交給真Playwright,
 *   即該檔第一個呼叫之runPlaywright之cfg.launch), 其後之嘗試共用同一行程。
 * ② 真實之browser.newPage(o)與browser.close()作用於整個瀏覽器; 此處newPage仍是真Browser.newPage(o)(每次一個新的context),
 *   close只關閉本次嘗試開出之頁面與其context, 瀏覽器留待dispose關閉。故各嘗試間之cookie與storage仍互相隔離,
 *   但「瀏覽器行程本身之啟動與關閉」只發生一次。
 * ③ next()失敗(含next()內重讀之登入守門拒絕、Playwright啟動失敗)時, 同檔其餘嘗試沿用同一失敗, 不再啟動。
 *   惟w-playwright於呼叫替身之前即拒絕者(環境、版本、前置之登入守門), 根本不到達替身, 不計入nCall, 亦不被沿用:
 *   其後之嘗試若條件已解除, 仍可能成為「第一次到達替身」而真啟動一次(至多一次之不變式不受影響)。
 * 未被取代: w-playwright之環境、版本、登入守門檢查與參數合併(每次嘗試皆走過), runPlaywright之導航、取內容與重試流程。
 *
 * dispose還原本替身後, 回到test/tools/noBrowser.mjs之基底替身(一律拒絕), 故逾時後殘存之抓取或重試不會真啟動。
 * 呼叫端於自身before/after內依序呼叫install/dispose, 使「先判斷skip、再起替身」之順序在測試檔內可見
 *
 * @returns {Object} 回傳{install,dispose,nLaunch,nLaunchOk,nCall,launchOpts}，install於before內呼叫以設定替身，dispose於after內呼叫以還原替身並關閉共用瀏覽器，nLaunch為呼叫next()(真啟動嘗試)之次數，nLaunchOk為真啟動成功之次數，nCall為替身被呼叫次數，launchOpts為各次收到之合併後選項陣列
 */
function createSharedChrome() {

    let pBrowser = null
    let nLaunch = 0
    let nLaunchOk = 0
    let nCall = 0
    let launchOpts = []
    let restore = null

    //以共用瀏覽器包出runPlaywright單次嘗試所用之介面(newPage、close)
    let wrap = (b) => {
        let pages = []
        return {
            newPage: async (o) => {
                let p = await b.newPage(o)
                pages.push(p)
                return p
            },
            close: async () => {
                for (let p of pages) {
                    await p.context().close().catch(() => {})
                }
            },
        }
    }

    let install = () => {
        restore = wpw.setBrowserTypeForTest({
            launch: async (merged, next) => {
                nCall += 1
                launchOpts.push(merged)
                if (!pBrowser) {
                    nLaunch += 1
                    pBrowser = withLaunchLock(() => next())
                    pBrowser.then(() => {
                        nLaunchOk += 1
                    }, () => {})
                }
                let b = await pBrowser
                return wrap(b)
            },
        })
    }

    let dispose = async () => {
        if (restore) {
            restore()
            restore = null
        }
        if (pBrowser) {
            let b = await pBrowser.catch(() => null)
            pBrowser = null
            if (b) {
                await b.close().catch(() => {})
            }
        }
    }

    return {
        install,
        dispose,
        get nLaunch() {
            return nLaunch
        },
        get nLaunchOk() {
            return nLaunchOk
        },
        get nCall() {
            return nCall
        },
        get launchOpts() {
            return launchOpts
        },
    }
}


export { withLaunchLock }
export default createSharedChrome
