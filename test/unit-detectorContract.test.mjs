import assert from 'assert'
import map from 'lodash-es/map.js'
import inspectHtml from '../src/inspectHtml.mjs'
import { VALID_TYPES, ORIGIN_CUSTOM, isValidDetector, normalizeDetector } from '../src/detectorContract.mjs'
import { DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY } from '../src/constants.mjs'
import { htmlCnChallenge } from './tools/serverForTest.mjs'


//使用端判識器(opt.detectors)之契約回歸測試。
//
//此機制存在的理由: 套件的發版次數必然少於安裝方遇到新情況的次數。內建判識器關鍵字全為英文,
//長篇非英語攔阻頁一個都不認得, 而唯一的兜底empty在文案一長時即失效。
//故套件提供註冊機制, 安裝方補自己遇到的。
describe('使用端判識器之契約', function() {

    //供「長文」情境用: 可見文字超過內容量閘門之正常文章
    let htmlLongArticle = '<html><head><title>談反爬蟲技術</title></head><body><p>' +
        '本文說明各家反爬蟲機制之運作，文中會提及verify you are human與captcha challenge等字樣。'.repeat(30) +
        '</p></body></html>'

    let mk = (over) => ({ id: 'cn', type: DETECT_CAPTCHA, message: '中文攔阻頁', test: (c) => c.lower.includes('正在进行安全检测'), ...over })

    describe('動機情境: 長篇中文攔阻頁', function() {

        //以下三條鎖住fixture本身的性質。fixture一旦漂移(文案改短、混入英文關鍵字),
        //下方「註冊後被攔下」即使通過也不再證明任何事——它可能只是被內建判識器攔下的
        it('內建判識器全數漏判此頁', function() {
            let t = inspectHtml(htmlCnChallenge)
            let r = [t.pass, t.type]
            let rr = [true, 'pass']
            assert.strict.deepEqual(r, rr)
        })

        it('此頁之可見文字超過內容量閘門, 故弱判準若受閘門保護即不會被比對', function() {

            //閘門值不由此檔擁有, 以「內建弱判準在此長度下確實被跳過」間接驗證,
            //而非複製一份門檻數字進來
            let withKeyword = htmlCnChallenge.replace('</p>', 'verify you are human</p>')
            let t = inspectHtml(withKeyword)
            let r = t.pass
            let rr = true
            assert.strict.deepEqual(r, rr)
        })

        it('註冊判識器後即被攔下, 且type與message由呼叫端決定', function() {
            let t = inspectHtml(htmlCnChallenge, { detectors: [mk()] })
            let r = [t.pass, t.type, t.message]
            let rr = [false, 'captcha', '中文攔阻頁']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('內容量閘門不套用於使用端判識器', function() {

        //本組是上一組的一般化: 閘門對「內建弱判準」與「使用端判識器」之處置刻意不同。
        //套件保證註冊者一定會被比對, 判準精確度由呼叫端負責; 理由見detectorContract.mjs檔頭
        it('未標任何強度之使用端判識器, 於長文上仍被比對', function() {
            let det = { id: 'x', type: DETECT_CAPTCHA, message: 'hit', test: (c) => c.lower.includes('反爬蟲') }
            let t = inspectHtml(htmlLongArticle, { detectors: [det] })
            let r = [t.pass, t.message]
            let rr = [false, 'hit']
            assert.strict.deepEqual(r, rr)
        })

        it('內建弱判準於同一頁上仍受閘門保護, 不因此改變', function() {

            //對稱檢查: 放寬只針對使用端這一側, 內建側不得跟著鬆掉,
            //否則談論反爬蟲的正常長文會被內建判識器誤殺(此為閘門當初存在的理由)
            let t = inspectHtml(htmlLongArticle)
            let r = [t.pass, t.type]
            let rr = [true, 'pass']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('evidence: 合成內容只比對semantic類', function() {

        it('未標evidence者視為semantic, 合成內容上仍被比對', function() {
            let t = inspectHtml(htmlCnChallenge, { contentKind: 'synthesized', detectors: [mk()] })
            let r = [t.pass, t.message]
            let rr = [false, '中文攔阻頁']
            assert.strict.deepEqual(r, rr)
        })

        it('標structural者於合成內容上不被比對', function() {
            let t = inspectHtml(htmlCnChallenge, { contentKind: 'synthesized', detectors: [mk({ evidence: 'structural' })] })
            let r = t.pass
            let rr = true
            assert.strict.deepEqual(r, rr)
        })

        it('標structural者於原始內容上照常被比對', function() {
            let t = inspectHtml(htmlCnChallenge, { detectors: [mk({ evidence: 'structural' })] })
            let r = [t.pass, t.message]
            let rr = [false, '中文攔阻頁']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('順序: 使用端排於內建之前, 故可覆寫', function() {

        it('同一頁面上使用端判識器優先於內建命中者', function() {

            //此頁內建會判為captcha(標題前綴), 使用端改判為empty且訊息不同
            let html = '<html><head><title>Just a moment...</title></head><body><p>x</p></body></html>'
            let base = inspectHtml(html)
            let over = inspectHtml(html, { detectors: [{ id: 'o', type: DETECT_EMPTY, message: '由呼叫端接手', test: () => true }] })
            let r = [base.type, base.message, over.type, over.message]
            let rr = ['captcha', 'Cloudflare/anti-bot challenge', 'empty', '由呼叫端接手']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('檢核: 不合契約者略過而非拋錯', function() {

        it('isValidDetector對各種不合法形狀皆回false', function() {
            let ok = { type: DETECT_CAPTCHA, message: 'm', test: () => true }
            let cases = [
                null,
                undefined,
                'str',
                123,
                [],
                {},
                { ...ok, type: 'unknown' },
                { ...ok, type: '' },
                { ...ok, message: '' },
                { ...ok, message: 123 },
                { ...ok, test: 'notfun' },
                { ...ok, test: undefined },
            ]
            let r = map(cases, isValidDetector)
            let rr = map(cases, () => false)
            assert.strict.deepEqual(r, rr)
        })

        it('isValidDetector對合法形狀回true, message可為字串或函數', function() {
            let r = [
                isValidDetector({ type: DETECT_CAPTCHA, message: 'm', test: () => true }),
                isValidDetector({ type: DETECT_VERIFY, message: () => 'm', test: () => true }),
            ]
            let rr = [true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('陣列中混入不合法者時只略過該項, 其餘照常運作', function() {
            let det = [null, { type: 'bogus', message: 'm', test: () => true }, mk()]
            let t = inspectHtml(htmlCnChallenge, { detectors: det })
            let r = [t.pass, t.message]
            let rr = [false, '中文攔阻頁']
            assert.strict.deepEqual(r, rr)
        })

        it('detectors非陣列或未給時一律視為無, 不拋錯', function() {
            let r = map([undefined, null, 'x', 123, {}], (v) => inspectHtml(htmlCnChallenge, { detectors: v }).pass)
            let rr = map([1, 2, 3, 4, 5], () => true)
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('錯誤邊界: 判識器拋錯只略過該項', function() {

        //與adapter刻意不同: adapter是內容來源, 壞掉必須顯性回報;
        //判識器是補充保護, 一個寫壞不該使整次抓取失敗
        it('拋錯之判識器被略過, 後續判識器照常命中', function() {
            let bad = {
                id: 'bad',
                type: DETECT_CAPTCHA,
                message: 'm',
                test: () => {
                    throw new Error('boom')
                },
            }
            let t = inspectHtml(htmlCnChallenge, { detectors: [bad, mk()], useShowLog: false })
            let r = [t.pass, t.message]
            let rr = [false, '中文攔阻頁']
            assert.strict.deepEqual(r, rr)
        })

        it('全部判識器皆拋錯時回傳pass, 不拋出至呼叫端', function() {
            let bad = {
                id: 'bad',
                type: DETECT_CAPTCHA,
                message: 'm',
                test: () => {
                    throw new Error('boom')
                },
            }
            let r = 'no-throw'
            let t = null
            try {
                t = inspectHtml('<html><head><title>t</title></head><body><p>' + 'x'.repeat(300) + '</p></body></html>', { detectors: [bad], useShowLog: false })
            }
            catch (err) {
                r = err.message
            }
            let rr = ['no-throw', true]
            assert.strict.deepEqual([r, t?.pass], rr)
        })

    })

    describe('正規化', function() {

        it('補上預設evidence與origin, 且origin不取自輸入', function() {
            let d = normalizeDetector({ type: DETECT_CAPTCHA, message: 'm', test: () => true, origin: 'builtin' })
            let r = [d.evidence, d.origin, d.id]
            let rr = ['semantic', ORIGIN_CUSTOM, 'custom']
            assert.strict.deepEqual(r, rr)
        })

        it('evidence只認structural, 其餘值一律落回semantic', function() {
            let r = map(['structural', 'semantic', 'STRUCTURAL', '', null, undefined, 1], (v) => normalizeDetector({ type: DETECT_CAPTCHA, message: 'm', test: () => true, evidence: v }).evidence)
            let rr = ['structural', 'semantic', 'semantic', 'semantic', 'semantic', 'semantic', 'semantic']
            assert.strict.deepEqual(r, rr)
        })

        it('不產生strength欄: 內容量閘門不適用於使用端判識器, 給了也不讀', function() {
            let d = normalizeDetector({ type: DETECT_CAPTCHA, message: 'm', test: () => true, strength: 'strong' })
            let r = [Object.prototype.hasOwnProperty.call(d, 'strength'), d.strength]
            let rr = [false, undefined]
            assert.strict.deepEqual(r, rr)
        })

        it('id為非空字串時保留, 否則落回預設', function() {
            let r = map(['mine', '', null, undefined, 7], (v) => normalizeDetector({ type: DETECT_CAPTCHA, message: 'm', test: () => true, id: v }).id)
            let rr = ['mine', 'custom', 'custom', 'custom', 'custom']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('type值域與constants同源', function() {

        //D4: 值域清單若與constants各寫一份, 新增type時只改一處即開縫。
        //此處鎖住「VALID_TYPES恰為DETECT_*之集合」, 而非複製字面值
        it('VALID_TYPES恰為四個DETECT_*常數', function() {
            let r = [...VALID_TYPES]
            let rr = [DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY]
            assert.strict.deepEqual(r, rr)
        })

        it('VALID_TYPES為凍結陣列, 不可被呼叫端就地改動', function() {
            let r = Object.isFrozen(VALID_TYPES)
            let rr = true
            assert.strict.deepEqual(r, rr)
        })

        it('四個type皆可實際註冊並命中, 回傳之type即所註冊者', function() {
            let r = map(VALID_TYPES, (tp) => inspectHtml(htmlCnChallenge, { detectors: [mk({ type: tp })] }).type)
            let rr = [...VALID_TYPES]
            assert.strict.deepEqual(r, rr)
        })

    })

})
