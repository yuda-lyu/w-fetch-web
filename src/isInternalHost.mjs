import isestr from 'wsemi/src/isestr.mjs'


//內網與保留位址之判別：本模組為其唯一事實來源
//
//用途只有一個：**把關本套件自己推導出來的網址**，不是把關呼叫端給的網址。
//這條分界是本模組存在的理由，寫在這裡以免日後被誤用到別處：
//
//  呼叫端給的網址      是他的決定。他要抓自己的內網服務是正當用法, 套件不該擋
//  套件推導出的網址    來自攻擊者可控的資料(轉址服務之query參數), 套件必須擋
//
//── 為何需要它（實測可觸發之SSRF） ──
//extractRedirectTarget會把轉址服務query參數內的網址取出, 交由fetchWeb重走完整流程。
//此前只要該網址本身合法(http/https)就照抓, 目標位址無任何檢核。實測:
//
//  呼叫端輸入 https://www.linkedin.com/redir/redirect?url=http%3A%2F%2F127.0.0.1%3AP%2Flatest%2Fmeta-data%2F
//  → 本機端點確實收到請求, 其內容(含機密字串)原樣回到呼叫端
//
//**它比「呼叫端直接傳內網網址」嚴重**: 呼叫端若有白名單(只接受linkedin.com之網址),
//上面那個輸入會通過白名單, 而後套件自行把它換成內網端點去抓——套件打穿了呼叫端的防線。
//
//此前的修法只錨定了網域(擋掉「攻擊者自有網域模仿pattern」那個變體),
//對「用真正的轉址服務網址帶任意目標」這個主變體完全無效。修一個輸入而非一類。
//
//── IPv6必須真的解析，不可用字串比對（實測繞過） ──
//此前IPv4-mapped那條寫成 /::ffff:(\d+\.\d+\.\d+\.\d+)$/ ——要求點分十進位。
//但唯一的呼叫端傳進來的是 new URL(target).hostname, 而WHATWG之IPv6序列化**恆輸出十六進位**:
//
//  new URL('http://[::ffff:127.0.0.1]/x').hostname  →  '[::ffff:7f00:1]'
//
//於是該分支對所有真實輸入恆不成立(死碼), 而以字面值寫的單元測試卻是綠的——
//**判準照實作寫、不照真實輸入寫**, 正是CLAUDE_experience.md二之2記載的形狀,
//由我在同一輪、同一個安全修補內再犯一次。實測可完整繞過:
//  https://www.linkedin.com/redir/redirect?url=http%3A%2F%2F%5B%3A%3Affff%3A127.0.0.1%5D%2F...
//  → 內網端點確實收到請求, 內容原樣回到呼叫端
//
//故改為把IPv6展開成8組16位元後以數值判定, 兩種書寫形態自然同解。
//測試亦須以 new URL().hostname 為輸入而非字面值(見unit-isInternalHost)
//
//── 本模組擋不住什麼（不可假裝已解決） ──
//DNS rebinding: 公開網域名解析到私有位址者, 本模組看不出來——它只看字面主機。
//要擋須解析DNS並釘住位址後再連線, 那需要抓取層配合(curl與playwright皆非本套件直接控制),
//故列為已知限制而非佯稱涵蓋


//IPv4字面位址之四段解析, 非此形態回null
function _v4(hostname) {
    let m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (!m) {
        return null
    }
    let ns = [m[1], m[2], m[3], m[4]].map((v) => parseInt(v, 10))
    if (ns.some((v) => v > 255)) {
        return null
    }
    return ns
}


//IPv4之保留與私有網段
function _isInternalV4(ns) {
    let [a, b] = ns

    //0.0.0.0/8 本機; 部分網路堆疊會把0.0.0.0視為localhost
    if (a === 0) {
        return true
    }

    //127.0.0.0/8 loopback
    if (a === 127) {
        return true
    }

    //10.0.0.0/8 私有
    if (a === 10) {
        return true
    }

    //172.16.0.0/12 私有
    if (a === 172 && b >= 16 && b <= 31) {
        return true
    }

    //192.168.0.0/16 私有
    if (a === 192 && b === 168) {
        return true
    }

    //169.254.0.0/16 link-local, 雲端metadata端點(169.254.169.254)即在此段
    if (a === 169 && b === 254) {
        return true
    }

    //100.64.0.0/10 CGNAT
    if (a === 100 && b >= 64 && b <= 127) {
        return true
    }

    return false
}


//IPv6解析為8組16位元, 非此形態回null
//支援'::'省略與尾端點分十進位(如::ffff:127.0.0.1)兩種書寫
function _v6(h) {
    if (!h.includes(':')) {
        return null
    }

    //尾端若為點分十進位, 先轉成兩組16位元
    let s = h
    let tail = s.match(/:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (tail) {
        let ns = _v4(tail[1])
        if (!ns) {
            return null
        }
        let hex = ((ns[0] << 8) | ns[1]).toString(16) + ':' + ((ns[2] << 8) | ns[3]).toString(16)
        s = s.slice(0, s.length - tail[1].length) + hex
    }

    //以'::'切為前後兩段, 中間補零至8組
    let parts = s.split('::')
    if (parts.length > 2) {
        return null
    }
    let toGroups = (v) => (v === '' ? [] : v.split(':'))
    let head = toGroups(parts[0])
    let rear = parts.length === 2 ? toGroups(parts[1]) : []
    let groups = parts.length === 2
        ? [...head, ...Array(8 - head.length - rear.length).fill('0'), ...rear]
        : head
    if (groups.length !== 8) {
        return null
    }

    let out = []
    for (let g of groups) {
        if (!/^[0-9a-f]{1,4}$/.test(g)) {
            return null
        }
        out.push(parseInt(g, 16))
    }
    return out
}


//IPv6之保留與私有網段
function _isInternalV6(g) {

    //:: 未指定, ::1 loopback
    let allZeroHead = g.slice(0, 7).every((v) => v === 0)
    if (allZeroHead && (g[7] === 0 || g[7] === 1)) {
        return true
    }

    //fc00::/7 unique local
    if ((g[0] & 0xfe00) === 0xfc00) {
        return true
    }

    //fe80::/10 link-local
    if ((g[0] & 0xffc0) === 0xfe80) {
        return true
    }

    //末32位元還原為IPv4之三種形態: IPv4-mapped(::ffff:x)、IPv4-compatible(::x)、NAT64(64:ff9b::/96)
    let toV4 = () => [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]
    let zero0to4 = g.slice(0, 5).every((v) => v === 0)
    if (zero0to4 && (g[5] === 0xffff || g[5] === 0)) {
        return _isInternalV4(toV4())
    }
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((v) => v === 0)) {
        return _isInternalV4(toV4())
    }

    return false
}


/**
 * 判別主機名是否指向內網、迴環或保留位址
 *
 * 僅供把關本套件自行推導出之網址（如由轉址服務query參數提取者），
 * 不可用於把關呼叫端明確給定之網址——後者是呼叫端的決定
 *
 * @param {String} hostname 輸入主機名字串，不含協定與埠
 * @returns {Boolean} 回傳是否為內網或保留位址之布林值
 * @example
 *
 * import isInternalHost from './src/isInternalHost.mjs'
 *
 * console.log(isInternalHost('169.254.169.254'), isInternalHost('127.0.0.1'), isInternalHost('localhost'))
 * // => true true true
 *
 * console.log(isInternalHost('example.com'), isInternalHost('8.8.8.8'))
 * // => false false
 *
 */
function isInternalHost(hostname) {

    if (!isestr(hostname)) {
        return true
    }

    let h = hostname.toLowerCase().trim()

    //IPv6以中括號包覆時先去除
    if (h.startsWith('[') && h.endsWith(']')) {
        h = h.slice(1, -1)
    }

    //localhost與其子網域
    if (h === 'localhost' || h.endsWith('.localhost')) {
        return true
    }

    //mDNS與常見內網後綴
    if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localdomain')) {
        return true
    }

    //單標籤主機名(不含點)無法是公開站台, 於推導路徑一律視為內網
    //如http://intranet/或http://metadata/, 是內網SSRF之常見形態
    if (!h.includes('.') && !h.includes(':')) {
        return true
    }

    let ns = _v4(h)
    if (ns) {
        return _isInternalV4(ns)
    }

    //IPv6: 展開為8組16位元後以數值判定, 不做字串比對(理由見檔頭)
    let g6 = _v6(h)
    if (g6) {
        return _isInternalV6(g6)
    }

    //含冒號卻解不出IPv6者形態不明, 於推導路徑一律視為內網(寧可不提取)
    if (h.includes(':')) {
        return true
    }

    return false
}


export default isInternalHost
