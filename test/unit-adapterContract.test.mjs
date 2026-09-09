import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { isValidAdapter, meetsMinContent, normalizeParsed } from '../src/adapterContract.mjs'


//adapter契約之單元測試。
//端對端行為另見 api-adapterContract.test.mjs(R01-R07回歸), 該檔由fetchWeb驅動;
//本檔直接測契約模組本身, 並守住「契約只有一處實作」


describe('isValidAdapter', function() {

    it('形狀完整者為合法', function() {
        let r = [
            isValidAdapter({ id: 'a', match: /x/, parse: () => ({}) }),
            isValidAdapter({ id: 'a', match: () => true, parse: async () => ({}) }),
        ]
        let rr = [true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('非物件、缺id、match型別不符、缺parse皆為不合法', function() {
        let r = [
            isValidAdapter(null),
            isValidAdapter('x'),
            isValidAdapter({ match: /x/, parse: () => ({}) }),
            isValidAdapter({ id: '', match: /x/, parse: () => ({}) }),
            isValidAdapter({ id: 'a', match: 'x', parse: () => ({}) }),
            isValidAdapter({ id: 'a', match: /x/ }),
            isValidAdapter({ id: 'a', match: /x/, parse: 'f' }),
        ]
        let rr = [false, false, false, false, false, false, false]
        assert.strict.deepEqual(r, rr)
    })

})


describe('meetsMinContent', function() {

    it('門檻為50字, 邊界為達標', function() {
        let r = [
            meetsMinContent('x'.repeat(49)),
            meetsMinContent('x'.repeat(50)),
            meetsMinContent(''),
        ]
        let rr = [false, true, false]
        assert.strict.deepEqual(r, rr)
    })

})


describe('normalizeParsed', function() {

    let ok = 'x'.repeat(60)

    it('非物件回parse-error', function() {
        let r = [normalizeParsed(null, 'p ').reason, normalizeParsed('x', 'p ').reason]
        let rr = ['parse-error', 'parse-error']
        assert.strict.deepEqual(r, rr)
    })

    it('success非嚴格布林一律回parse-error', function() {
        let r = ['true', 1, 'false', 0, null, undefined, {}].map((v) => {
            return normalizeParsed({ success: v, content: ok }, 'p ').reason
        })
        let rr = Array(7).fill('parse-error')
        assert.strict.deepEqual(r, rr)
    })

    it('失敗時保留adapter自述之reason與message', function() {
        let t = normalizeParsed({ success: false, reason: 'paywall', message: '需訂閱' }, 'p ')
        let r = [t.success, t.reason, t.message]
        let rr = [false, 'paywall', '需訂閱']
        assert.strict.deepEqual(r, rr)
    })

    it('失敗但未自述時給預設reason', function() {
        let t = normalizeParsed({ success: false }, 'p ')
        let r = [t.reason, t.message]
        let rr = ['adapter-parse-failed', 'p parse failed']
        assert.strict.deepEqual(r, rr)
    })

    it('內容未達門檻時回empty-content', function() {
        let r = [
            normalizeParsed({ success: true, content: 'x'.repeat(49) }, 'p ').reason,
            normalizeParsed({ success: true }, 'p ').reason,
        ]
        let rr = ['empty-content', 'empty-content']
        assert.strict.deepEqual(r, rr)
    })

    it('成功時只投影白名單四欄, 保留欄位一律不採用', function() {
        let t = normalizeParsed({
            success: true,
            title: 't',
            content: ok,
            contentLength: 99999,
            html: '<p>x</p>',
            method: 'hacked',
            snapshot: 's',
        }, 'p ')
        let r = [Object.keys(t).sort(), t.contentLength]
        let rr = [['content', 'contentLength', 'success', 'title'], ok.length]
        assert.strict.deepEqual(r, rr)
    })

    it('title非字串時取空字串', function() {
        let r = normalizeParsed({ success: true, title: 123, content: ok }, 'p ').title
        let rr = ''
        assert.strict.deepEqual(r, rr)
    })

})


describe('契約之單一擁有者', function() {

    it('src內不得有第二處最低字數門檻比較', function() {

        //MIN_CONTENT只應被adapterContract消費; 其餘檔案一律呼叫meetsMinContent,
        //否則adapter路徑與Readability路徑會各自演化而分歧
        let hits = fs.readdirSync('src')
            .filter((v) => v.endsWith('.mjs') && v !== 'adapterContract.mjs' && v !== 'constants.mjs')
            .filter((v) => fs.readFileSync(path.join('src', v), 'utf8').includes('MIN_CONTENT'))

            //inspectHtml僅於註解提及, 不含實際比較
            .filter((v) => v !== 'inspectHtml.mjs')
        let r = hits
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

    it('src內不得有第二處adapter形狀檢核', function() {

        //以「檢核adapter.id或adapter.parse之型別」為特徵——那是輸入契約專屬之動作。
        //注意findAdapter仍有instanceof RegExp, 但那是**分派**(決定走RegExp或函數比對路徑),
        //不是檢核, 故不以該字串為判準
        let hits = fs.readdirSync('src')
            .filter((v) => v.endsWith('.mjs') && v !== 'adapterContract.mjs')
            .filter((v) => {
                let t = fs.readFileSync(path.join('src', v), 'utf8')
                return t.includes('isestr(adapter.id)') || t.includes('isfun(adapter.parse)')
            })
        let r = hits
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

})
