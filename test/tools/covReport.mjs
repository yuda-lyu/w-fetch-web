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
let totUnc = 0

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

    let uncovered = []
    let eff = 0
    for (let i = 0; i < lines.length; i++) {
        let t = lines[i].trim()
        if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) {
            continue
        }
        eff += 1
        let s = lineStart[i]
        let e = s + lines[i].length

        //該行只要有任一非空白字元未被覆蓋即計為未覆蓋
        let bad = false
        for (let k = s; k < e; k++) {
            if (src[k].trim() !== '' && covered[k] === 0) {
                bad = true
                break
            }
        }
        if (bad) {
            uncovered.push(i + 1)
        }
    }

    totEff += eff
    totUnc += uncovered.length
    rows.push({ file: path.basename(fp), eff, unc: uncovered.length, lines: uncovered })
}

rows.sort((a, b) => b.unc - a.unc)
for (let r of rows) {
    if (r.unc > 0) {
        console.log(String(r.unc).padStart(3) + '/' + String(r.eff).padStart(4) + '  ' + r.file.padEnd(34) + ' 行: ' + r.lines.join(','))
    }
}
console.log('---')
console.log('有效行 ' + totEff + ', 未覆蓋 ' + totUnc + ', 覆蓋率 ' + ((1 - totUnc / totEff) * 100).toFixed(1) + '%')
console.log('計入檔案數 ' + rows.length + ' / src共 ' + fs.readdirSync('./src').filter((v) => v.endsWith('.mjs')).length)
