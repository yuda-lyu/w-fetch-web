import wpw from 'w-playwright'


/**
 * 檢核執行環境是否有可供channel='chrome'使用之系統Chrome, 用於測試中判斷是否跳過須實際啟動瀏覽器之案例
 *
 * 原本以實際啟動瀏覽器探測(每個測試檔各啟動一次); Windows上Chromium 153起每啟動一次瀏覽器根行程,
 * 錯誤密碼次數即+1, 探測本身就在消耗帳號鎖定之額度。故改以w-playwright之findSystemChrome判定:
 * 只以檔案存在判定, 不啟動瀏覽器。代價是只判存在、不代表可啟動(權限、相依等不在判斷內),
 * 存在而無法啟動者, 該檔之案例會失敗而非跳過。
 *
 * 須注意無頭與有頭是兩件事：Linux之CI常裝有Chrome而無頭可用，但有頭需要顯示伺服器
 * (無DISPLAY與WAYLAND_DISPLAY時啟動即失敗)。故有頭須另判顯示伺服器，不可用無頭之結果推論有頭可用
 *
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Boolean} [opt.headed=false] 輸入是否判斷有頭模式布林值，預設false代表判斷無頭
 * @returns {Promise} 回傳Promise，resolve回傳該模式是否可用布林值
 */
async function hasChrome(opt = {}) {

    let headed = opt.headed === true

    if (wpw.findSystemChrome({ channel: 'chrome' }) === '') {
        return false
    }

    if (headed && process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
        return false
    }

    return true
}


export default hasChrome
