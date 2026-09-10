import fs from 'fs'
import path from 'path'


//站台特化知識之盤點指令: `node test/tools/auditSiteRules.mjs`
//
//本套件的站台知識散在三個檔, 且**同一個站台可能同時出現在多處**。
//此前曾只 grep 其中兩個檔就下「沒有任何站台同時出現在兩處」的結論, 而 msn、news.google
//當時就同時出現在 routeByUrl 與 inspectHtml——列舉軸的成員時 grep 範圍不夠廣, 結論即錯。
//故把「範圍」寫成可重跑的腳本而非留在記憶裡: 三個檔皆為本腳本之掃描對象,
//新增第四個存放站台知識的檔時, 須同時在 SOURCES 登記, 否則盤點結果會再度不完整。
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

        //反爬蟲廠商之特徵位址。與inspectHtml內聯的captcha-delivery.com、edgesuite.net同類,
        //只是被抽成獨立模組; 漏掉此檔會使同一類知識掃一個漏一個——正是本腳本要防的那種漏
        file: 'src/challengeResources.mjs',
        label: 'challengeResources',
        pick: (t) => {
            let m = t.match(/CHALLENGE_RESOURCES = \[([^\]]*)\]/)
            if (!m) {
                return []
            }
            return [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1])
        },
    },
]


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
            if (NON_SITE.includes(k)) {
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
}


main()
