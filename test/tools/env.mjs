import resolveCamofoxServer from '../../src/resolveCamofoxServer.mjs'


//測試環境開關之單一擁有者
//
//此處只收「散在多個測試檔、且各自手寫會逐漸分歧」的判斷。
//hasChrome不收在此: 它已是單一擁有者(test/tools/hasChrome.mjs), 且其「無頭與有頭須分別探測」
//之說明必須與該函數同處, 搬過來只會讓註解離開它所守護的程式
//
//各開關之語意見下方各常數之註解, 此處為其唯一說明處


//CI環境
//GitHub Actions會自動設CI=true與GITHUB_ACTIONS=true。
//佔用固定埠、spawn子行程、或需顯示器之案例於CI一律跳過
let isCI = process.env.CI === 'true' || process.env.CI === '1' || process.env.GITHUB_ACTIONS === 'true'


//是否已安裝@askjo/camofox-browser
//未安裝時無server.js可spawn, 為camofox相關案例之功能性前提
let camofoxInstalled = resolveCamofoxServer() !== null


//是否跳過有頭瀏覽器案例
//CI無顯示器故一律跳過; 本機另可設WFETCHWEB_SKIP_HEADED=1臨時停用, 避免測試期間彈出視窗
let skipHeaded = isCI || process.env.WFETCHWEB_SKIP_HEADED === '1'


//是否執行實際啟動Camofox瀏覽器之案例
//該類案例耗時且須已下載Camoufox執行檔, 故預設關閉, 以WFETCHWEB_TEST_CAMOFOX=1開啟
let testCamofox = process.env.WFETCHWEB_TEST_CAMOFOX === '1'


export {
    isCI,
    camofoxInstalled,
    skipHeaded,
    testCamofox
}
