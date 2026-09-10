import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'


//彙整NODE_V8_COVERAGE產出之原始資料, 只計src/*.mjs
//
//要點: 每個process各產生一份json, 同一檔可出現於多份。
//某份內count為0只代表「該process未執行」, 不代表未被測到,
//故須**逐份**各自算出覆蓋圖後再取聯集, 不可把各份的range混在一起判定。
//單份內ranges為巢狀且由外而內排列, 依序覆寫即得最內層之count
let fdCov = process.env.WFETCHWEB_COV_DIR || './tmp/cov'
let fdSrc = path.resolve('./src')

let byFile = {}

for (let fn of fs.readdirSync(fdCov)) {
    let j = JSON.parse(fs.readFileSync(path.join(fdCov, fn), 'utf8'))
    for (let sc of j.result) {
        if (!sc.url.startsWith('file:')) {
            continue
        }
        let fp = null
        try {
            fp = fileURLToPath(sc.url)
        }
        catch {
            continue
        }
        if (!fp.startsWith(fdSrc) || !fp.endsWith('.mjs')) {
            continue
        }
        if (!byFile[fp]) {
            byFile[fp] = []
        }
        byFile[fp].push(sc)
    }
}

let rows = []
let totEff = 0
let totDead = 0
let totPartial = 0

for (let fp of Object.keys(byFile).sort()) {
    let src = fs.readFileSync(fp, 'utf8')

    //聯集覆蓋圖: 任一process執行到即視為已覆蓋
    let covered = new Uint8Array(src.length)

    for (let sc of byFile[fp]) {
        let one = new Uint8Array(src.length)
        for (let f of sc.functions) {
            for (let r of f.ranges) {
                one.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset)
            }
        }
        for (let k = 0; k < src.length; k++) {
            if (one[k]) {
                covered[k] = 1
            }
        }
    }

    //offset轉行號
    let lines = src.split('\n')
    let lineStart = []
    let acc = 0
    for (let ln of lines) {
        lineStart.push(acc)
        acc += ln.length + 1
    }

    //逐行分成三種狀態:
    //  covered   該行所有非空白字元皆被執行
    //  dead      該行完全沒被執行——真正未測到的程式
    //  partial   行內部分未覆蓋, 通常是 `a || b` 之右側或 `?.` 短路分支未走到,
    //            該行主體其實有執行。兩者混為一談會把「少一個fallback分支」誇大成
    //            「整行未測」, 使報表看起來有大量未測的業務邏輯而誤導判讀
    let dead = []
    let partial = []
    let eff = 0
    for (let i = 0; i < lines.length; i++) {
        let t = lines[i].trim()
        if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) {
            continue
        }
        eff += 1
        let s = lineStart[i]
        let e = s + lines[i].length

        let nCode = 0
        let nUnc = 0
        for (let k = s; k < e; k++) {
            if (src[k].trim() !== '') {
                nCode += 1
                if (covered[k] === 0) {
                    nUnc += 1
                }
            }
        }
        if (nUnc === 0) {
            continue
        }
        if (nUnc === nCode) {
            dead.push(i + 1)
        }
        else {
            partial.push(i + 1)
        }
    }

    totEff += eff
    totDead += dead.length
    totPartial += partial.length
    rows.push({ file: path.basename(fp), eff, dead, partial })
}

rows.sort((a, b) => (b.dead.length - a.dead.length) || (b.partial.length - a.partial.length))
for (let r of rows) {
    if (r.dead.length === 0 && r.partial.length === 0) {
        continue
    }
    console.log(String(r.dead.length).padStart(3) + '/' + String(r.eff).padStart(4) + '  ' + r.file.padEnd(34) +
        (r.dead.length > 0 ? ' 未執行: ' + r.dead.join(',') : '') +
        (r.partial.length > 0 ? '  [行內分支: ' + r.partial.join(',') + ']' : ''))
}
console.log('---')
console.log('有效行 ' + totEff + ', 未執行 ' + totDead + ', 行內分支未覆蓋 ' + totPartial)
console.log('行覆蓋率 ' + ((1 - totDead / totEff) * 100).toFixed(1) + '%' +
    ', 併計行內分支則為 ' + ((1 - (totDead + totPartial) / totEff) * 100).toFixed(1) + '%')
console.log('計入檔案數 ' + rows.length + ' / src共 ' + fs.readdirSync('./src').filter((v) => v.endsWith('.mjs')).length)
