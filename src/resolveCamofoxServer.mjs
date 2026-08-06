import { createRequire } from 'module'
import { join } from 'path'


//Camofox server之模組入口
let CAMOFOX_SERVER = '@askjo/camofox-browser/server.js'


/**
 * 以Node模組解析機制取得已安裝之@askjo/camofox-browser之server.js位置
 *
 * 該套件之server.js無任何export，且於top-level即無條件listen，故只能spawn為子行程執行，
 * 不可直接import，否則載入本套件時即會於行程內啟動Camofox server；
 * 先由本模組位置解析，不論套件被hoist至哪一層node_modules皆可正確找到，
 * 再由使用端cwd解析，供打包後(import.meta.url已失真)之執行環境使用
 *
 * @returns {String|null} 回傳server.js之絕對路徑字串，未安裝時回傳null
 * @example
 *
 * import resolveCamofoxServer from './src/resolveCamofoxServer.mjs'
 *
 * console.log(resolveCamofoxServer())
 * // => 'D:\\my-proj\\node_modules\\@askjo\\camofox-browser\\server.js'
 *
 */
function resolveCamofoxServer() {

    //由本模組位置解析
    try {
        return createRequire(import.meta.url).resolve(CAMOFOX_SERVER)
    }
    catch {}

    //由使用端cwd解析
    try {
        return createRequire(join(process.cwd(), 'index.js')).resolve(CAMOFOX_SERVER)
    }
    catch {}

    return null
}


export default resolveCamofoxServer
