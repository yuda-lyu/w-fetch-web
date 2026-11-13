import wpw from 'w-playwright'


//測試行程之基底替身: 拒絕一切未經test/tools/sharedChrome.mjs之真瀏覽器啟動
/*
 * 本模組於載入時即以w-playwright之setBrowserTypeForTest安裝一個「一律拒絕」之替身, 且永不還原。
 * w-playwright之替身為堆疊(最後設定且未還原者生效): sharedChrome與接線測試之替身疊在其上,
 * 它們還原後即回到本基底, 故下列情形皆被拒而不會真啟動:
 * ① 不該啟動瀏覽器之測試檔, 因curl等前階意外失敗而升級至瀏覽器階(auto模式);
 * ② 案例逾時後, mocha已執行after還原替身, 但尚未結束之抓取或其重試才呼叫啟動。
 * 拒絕即拋錯(經w-playwright轉為E_LAUNCH, 抓取函數回playwright-error), 並於stderr留一行以便查明。
 *
 * 凡匯入可達src/runPlaywright.mjs之模組(runPlaywright、fetchWebByPlaywrightHeadless、fetchWebByPlaywrightHead、
 * runPlan、fetchWeb、WFetchWeb)之測試檔, 皆須匯入本模組(盤點指令見規則帳本)
 */
let nRefused = 0

let refuse = (kind) => {
    nRefused += 1
    process.stderr.write(`[test/tools/noBrowser] refused real browser ${kind} (not via sharedChrome)\n`)
    throw new Error('real browser launch refused in tests: use test/tools/sharedChrome.mjs')
}

wpw.setBrowserTypeForTest({
    launch: async () => refuse('launch'),
    launchPersistentContext: async () => refuse('launchPersistentContext'),
})


/**
 * 取得本行程被基底替身拒絕之啟動次數
 *
 * @returns {Integer} 回傳被拒次數整數
 */
function getRefusedCount() {
    return nRefused
}


export default getRefusedCount
