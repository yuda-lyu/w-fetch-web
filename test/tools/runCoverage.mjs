import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'


//以NODE_V8_COVERAGE跑完整測試套件並輸出各檔未覆蓋行報表
//
//用法(於專案根目錄):
//    node test/tools/runCoverage.mjs
//
//不使用額外覆蓋率套件: V8內建之覆蓋率資料已足夠, 且本套件之測試會spawn子行程(curl、camofox server),
//各子行程各產生一份原始資料, 由covReport.mjs逐份計算後取聯集
//
//執行參數不在此處寫死, 而是自package.json之scripts.test解析取得,
//使「怎麼跑測試」只有那一個來源: 該script由外部統一控制器管理, 改了之後本工具自動跟隨
//
//產出:
//    ./tmp/cov/         V8原始覆蓋率資料(每個process一份json)
//    ./tmp/cov-run.log  測試輸出
let fdCov = './tmp/cov'
let fpLog = './tmp/cov-run.log'


//清空前次資料, 否則舊process之資料會被算進聯集而虛報覆蓋率
fs.rmSync(fdCov, { recursive: true, force: true })
fs.mkdirSync(fdCov, { recursive: true })
fs.mkdirSync(path.dirname(fpLog), { recursive: true })

console.log('[cov] 執行測試套件...')

//自package.json取得測試指令, 拆出mocha之參數
//引號內視為單一參數, 使 "test/*.test.mjs" 這類含萬用字元者不被空白切開
function _tokenize(cmd) {
    let out = []
    let re = /"([^"]*)"|'([^']*)'|(\S+)/g
    let m = null
    while ((m = re.exec(cmd)) !== null) {
        out.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]))
    }
    return out
}

let pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
let cmdTest = pkg?.scripts?.test || ''
let tokens = _tokenize(cmdTest)
if (tokens[0] !== 'mocha') {
    console.log('[cov] package.json之scripts.test非以mocha開頭, 無法解析: ' + cmdTest)
    process.exit(1)
}
let argsTest = tokens.slice(1)
console.log('[cov] 沿用scripts.test之參數: ' + argsTest.join(' '))

//直接以node執行mocha之js入口而不經npx: 於Windows須shell:true才叫得動.cmd,
//而shell:true會使參數未經轉義即串接(Node之DEP0190)
let r = spawnSync(process.execPath, ['node_modules/mocha/bin/mocha.js', ...argsTest], {
    env: { ...process.env, NODE_V8_COVERAGE: fdCov },
    encoding: 'utf8',
})

let out = (r.stdout || '') + (r.stderr || '')
fs.writeFileSync(fpLog, out, 'utf8')

let mSum = out.match(/\d+ passing[\s\S]*?(?=\n\n|$)/)
console.log('[cov] ' + (mSum ? mSum[0].trim().replace(/\n/g, ' / ') : '測試輸出見 ' + fpLog))

let nJson = fs.readdirSync(fdCov).length
if (nJson === 0) {
    console.log('[cov] 未取得覆蓋率資料, 請檢查 ' + fpLog)
    process.exit(1)
}
console.log('[cov] 取得 ' + nJson + ' 份原始資料, 產生報表:')
console.log('')

let rr = spawnSync(process.execPath, ['test/tools/covReport.mjs'], { encoding: 'utf8' })
console.log(rr.stdout || '')
if (rr.stderr) {
    console.log(rr.stderr)
}
