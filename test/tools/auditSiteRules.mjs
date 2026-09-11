import fs from 'fs'
import path from 'path'


//站台特化知識之盤點指令: `node test/tools/auditSiteRules.mjs`
//
//本套件的站台與廠商知識散在多個檔, 且**同一個站台可能同時出現在多處**。
//此前曾只 grep 其中兩個檔就下「沒有任何站台同時出現在兩處」的結論, 而 msn、news.google
//當時就同時出現在 routeByUrl 與 inspectHtml——列舉軸的成員時 grep 範圍不夠廣, 結論即錯。
//故把「範圍」寫成可重跑的腳本而非留在記憶裡。
//
//**但範圍本身也會漏, 而且已經漏過兩次**（見下方 selfCheck）。所以本腳本不只掃 SOURCES,
//還會反過來檢查「SOURCES 以外的 src 檔案有沒有站台或廠商知識」, 有就以非零離開碼結束。
//新增存放此類知識的檔案時須在 SOURCES 登記, 忘了登記會被自檢擋下而非靜默通過。
//
//輸出為站台全集 × 出現處, 供對照規則帳本之站點數


//掃描對象與其取法
//每項之pick自檔案內容取出站台識別字串(以網域或其可辨識片段為單位)
let SOURCES = [
    {
        file: 'src/routeByUrl.mjs',
        label: 'routeByUrl',
        pick: (t) => {

            //自五組PATTERNS之regex字面量取網域: 去除跳脫與前綴, 取到第一個路徑分隔為止
            let out = []
            for (let m of t.matchAll(/\/\^https\?:\\\/\\\/([^/]*?)\\\//g)) {
                let s = m[1]

                    //去除選擇性子網域前綴之兩種寫法: (?:www\.)? 與 (?:[\w-]+\.)*
                    .replace(/\(\?:[^)]*\)[?*]/g, '')
                    .replace(/\\\./g, '.')
                    .replace(/^\.+|\.+$/g, '')
                if (s) {
                    out.push(s)
                }
            }
            return out
        },
    },
    {
        file: 'src/inspectHtml.mjs',
        label: 'inspectHtml',
        pick: (t) => {

            //站台知識在此檔有兩種形態: WRAPPER_TITLES之標題關鍵字, 與判識器test內之網域字串
            let out = []
            let w = t.match(/WRAPPER_TITLES = \[([^\]]*)\]/)
            if (w) {
                for (let m of w[1].matchAll(/'([^']+)'/g)) {
                    out.push(m[1])
                }
            }
            for (let m of t.matchAll(/includes\('(?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)'\)/g)) {
                out.push(m[1])
            }
            return out
        },
    },
    {
        file: 'src/defaultAdapters.mjs',
        label: 'defaultAdapters',
        pick: (t) => [...t.matchAll(/id: '([^']+)'/g)].map((m) => m[1]),
    },
    {

        //內建msn adapter之網址比對規則與內容API端點。站台知識寫在此檔而非defaultAdapters.mjs,
        //不登記即成為自檢所防的那種漏掃(本檔含msn.com, 自檢會以非零離開碼擋下)
        file: 'src/fetchMsn.mjs',
        label: 'fetchMsn',
        pick: (t) => (/msn\\\.com\\\//.test(t) ? ['msn.com'] : []),
    },
    {

        //反爬蟲廠商之特徵位址。與inspectHtml內聯的captcha-delivery.com、edgesuite.net同類,
        //只是被抽成獨立模組; 漏掉此檔會使同一類知識掃一個漏一個——正是本腳本要防的那種漏
        file: 'src/challengeResources.mjs',
        label: 'challengeResources',
        pick: (t) => {
            let out = []
            let m = t.match(/CHALLENGE_RESOURCES = \[([^\]]*)\]/)
            if (m) {
                out.push(...[...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]))
            }

            //單獨常數形態之廠商知識(CF_FRAME_HOST等)亦須計入, 否則新增一個又是一次漏
            for (let mm of t.matchAll(/^let [A-Z_]+ = '([^']+)'$/gm)) {
                out.push(mm[1])
            }
            return out
        },
    },
]


//**掃描範圍之自檢**：src內任何檔案出現廠商或站台識別字串卻不在SOURCES內，即為漏掃
//
//本腳本寫來防「grep範圍不夠就下結論」，而它自己已經漏過兩次：
//第一次漏掉challengeResources.mjs，第二次漏掉fetchWebByPlaywrightHead.mjs內
//手寫的challenges.cloudflare.com與.cf-turnstile——後者更嚴重，因為那是
//challengeResources.mjs自稱擁有的知識的第三份複本。
//**防漏的工具不會因為它的用途是防漏而自動免疫**，故加本節：範圍本身也要被盤點。
let KNOWN_TOKENS = [
    'challenges.cloudflare.com', 'hcaptcha.com', 'captcha-delivery.com', 'edgesuite.net',
    'perimeterx', 'cf-turnstile', 'cf-challenge-running', 'secitptpage', 'c-wiz',
    'wx.qq.com', 'x.com', 'twitter.com', 'news.google.com', 'msn.com', 'wsj.com',
    'linkedin.com', 'youtube.com', 'gelonghui.com', 'bloomberg.com', 'weixin.qq.com',
]


//取一個檔的「可比對程式碼」：去註解，並把regex跳脫還原
//
//**跳脫還原這一步是自檢能不能成立的關鍵**。本專案的路由是以regex字面量寫的，
//網域中的點一律跳脫為 `\.`，故 `code.includes('wsj.com')` 恆為 false——
//自檢第一版就是這樣：把 routeByUrl.mjs 自 SOURCES 拿掉，自檢仍回報「通過」且離開碼 0。
//**一個看不見本專案主要書寫形態的自檢，等於沒有自檢**（同一支腳本上的第三次同型錯誤）
function codeOf(file) {
    let t = fs.readFileSync(file, 'utf8')
    let code = t.split('\n').filter((line) => {
        let s = line.trim()
        return !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*')
    }).join('\n')

    //regex字面量之跳脫還原: \. → . ，使 /wsj\.com\// 與 'wsj.com' 可比對
    return code.replace(/\\\./g, '.')
}


function selfCheck(scanned) {
    let dir = 'src'
    let leaks = []
    for (let fn of fs.readdirSync(dir).filter((v) => v.endsWith('.mjs'))) {
        let rel = dir + '/' + fn
        if (scanned.includes(rel)) {
            continue
        }
        let code = codeOf(path.join(dir, fn))
        for (let tok of KNOWN_TOKENS) {
            if (code.includes(tok)) {
                leaks.push([rel, tok])
            }
        }
    }
    return leaks
}


//同一站台在三處的不同寫法
//
//本表是盤點能否成立的關鍵: 沒有它, 同一站台會因為寫法不同而被算成兩個, 於是
//「跨處出現」漏報——而「跨處出現」正是這份盤點唯一要回答的問題。
//WeChat即為實例: routeByUrl寫mp.weixin.qq.com(抓取路由), inspectHtml寫wx.qq.com(驗證頁判識),
//兩者是同一站台的兩種知識, 改其一而不看另一即為「修一個不比對兄弟」
let ALIAS = {
    'wx': 'weixin',
    'google news': 'google',
    'twitter': 'x',
}


//非站台之條目: WRAPPER_TITLES內混有通用載入關鍵字, 它們不屬於任何特定站台
let NON_SITE = ['loading', 'redirecting']


//CSS選擇器形態之條目不計入站台全集, 但仍須被掃描——掃描是為了自檢的擁有權, 計數是為了站台分佈
function isSelector(v) {
    return v.startsWith('#') || v.startsWith('.') || v.includes(', ')
}


//把各處取得之識別字串正規化為可互相比對之站台鍵
//三處的形態不同(網域/標題關鍵字/adapter id), 故取其主體名稱作為鍵
function toKey(s) {
    let v = String(s).toLowerCase().trim()

    //去掉常見前綴與副檔式尾綴, 取主體
    v = v.replace(/^(?:www|mp|news|m)\./, '')
    v = v.replace(/\.(?:com|net|org|cn|io|co)(?:\.[a-z]{2})?$/, '')
    v = v.replace(/\.qq$/, '')
    return ALIAS[v] || v
}


function main() {
    let byKey = new Map()
    let counts = []

    for (let s of SOURCES) {
        let p = path.join(...s.file.split('/'))
        if (!fs.existsSync(p)) {
            console.error('缺少掃描對象: ' + s.file)
            process.exitCode = 1
            return
        }
        let raw = s.pick(fs.readFileSync(p, 'utf8'))
        counts.push([s.label, raw.length])
        for (let v of raw) {
            let k = toKey(v)
            if (NON_SITE.includes(k) || isSelector(v)) {
                continue
            }
            if (!byKey.has(k)) {
                byKey.set(k, new Map())
            }
            let m = byKey.get(k)
            if (!m.has(s.label)) {
                m.set(s.label, [])
            }
            m.get(s.label).push(v)
        }
    }

    let keys = [...byKey.keys()].sort()
    let multi = keys.filter((k) => byKey.get(k).size > 1)

    console.log('站台特化知識盤點')
    console.log('')
    console.log('各處條目數: ' + counts.map(([l, n]) => l + '=' + n).join('  '))
    console.log('站台全集: ' + keys.length + ' 個')
    console.log('跨處出現: ' + multi.length + ' 個 ' + (multi.length > 0 ? '(' + multi.join(', ') + ')' : ''))
    console.log('')
    console.log('站台'.padEnd(16) + '出現處')
    console.log('-'.repeat(60))
    for (let k of keys) {
        let m = byKey.get(k)
        let where = [...m.entries()].map(([l, vs]) => l + '[' + vs.join('|') + ']').join('  ')
        console.log(k.padEnd(16) + where)
    }

    //掃描範圍自檢: 有漏掃即以非零離開碼結束, 使它不會靜默通過
    let leaks = selfCheck(SOURCES.map((s) => s.file))
    console.log('')
    if (leaks.length === 0) {
        console.log('掃描範圍自檢: 通過（SOURCES 以外之 src 檔案未出現已知廠商或站台識別字串）')
        return
    }
    console.log('掃描範圍自檢: **未通過** — 下列檔案含站台或廠商知識卻不在 SOURCES 內：')
    for (let [f, tok] of leaks) {
        console.log('  ' + f + '  →  ' + tok)
    }
    process.exitCode = 1
}


//以指令直接執行時才輸出報表; 被測試import時只取用其函數
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('test/tools/auditSiteRules.mjs')) {
    main()
}


export {
    SOURCES,
    KNOWN_TOKENS,
    selfCheck
}
export default main
