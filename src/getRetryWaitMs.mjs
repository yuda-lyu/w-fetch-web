import ispint from 'wsemi/src/ispint.mjs'


//重試政策: 本模組為其單一擁有者
//預設重試次數(含初始共執行DEFAULT_MAX_RETRIES+1次)
let DEFAULT_MAX_RETRIES = 5

//線性退避之初始與上限毫秒
let INITIAL_WAIT_MS = 3000
let MAX_WAIT_MS = 15000


/**
 * 取得重試前之線性退避等待毫秒
 *
 * 第n次失敗後等待n*3000毫秒，上限15000毫秒，即3000、6000、9000、12000、15000、15000...
 *
 * @param {Integer} attempt 輸入第幾次嘗試之正整數，由1起算
 * @returns {Integer} 回傳等待毫秒整數
 * @example
 *
 * import getRetryWaitMs from './src/getRetryWaitMs.mjs'
 *
 * console.log(getRetryWaitMs(1), getRetryWaitMs(2), getRetryWaitMs(5), getRetryWaitMs(99))
 * // => 3000 6000 15000 15000
 *
 */
function getRetryWaitMs(attempt) {

    //check
    //attempt由1起算, 0不在契約內。此處須用ispint而非isp0int——
    //isp0int允許0會使getRetryWaitMs(0)回0, 若日後共用retry runner採零起算即成熱迴圈
    if (!ispint(attempt)) {
        return INITIAL_WAIT_MS
    }

    return Math.min(INITIAL_WAIT_MS * attempt, MAX_WAIT_MS)
}


export { DEFAULT_MAX_RETRIES }
export default getRetryWaitMs
