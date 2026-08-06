import assert from 'assert'
import keys from 'lodash-es/keys.js'
import map from 'lodash-es/map.js'
import wi from '../src/WFetchWeb.mjs'
import fetchWeb from '../src/fetchWeb.mjs'
import fetchWebByCurl from '../src/fetchWebByCurl.mjs'
import fetchWebByPlaywrightHeadless from '../src/fetchWebByPlaywrightHeadless.mjs'
import fetchWebByPlaywrightHead from '../src/fetchWebByPlaywrightHead.mjs'
import fetchWebByCamofox from '../src/fetchWebByCamofox.mjs'


describe('WFetchWeb', function() {

    it('對外僅提供各fetch函數', function() {
        let r = keys(wi)
        let rr = [
            'fetchWeb',
            'fetchWebByCurl',
            'fetchWebByPlaywrightHeadless',
            'fetchWebByPlaywrightHead',
            'fetchWebByCamofox',
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('各鍵值皆為函數', function() {
        let r = map(keys(wi), (k) => typeof wi[k])
        let rr = ['function', 'function', 'function', 'function', 'function']
        assert.strict.deepEqual(r, rr)
    })

    it('各鍵值即為對應模組之預設匯出', function() {
        let r = [
            wi.fetchWeb === fetchWeb,
            wi.fetchWebByCurl === fetchWebByCurl,
            wi.fetchWebByPlaywrightHeadless === fetchWebByPlaywrightHeadless,
            wi.fetchWebByPlaywrightHead === fetchWebByPlaywrightHead,
            wi.fetchWebByCamofox === fetchWebByCamofox,
        ]
        let rr = [true, true, true, true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('可由WFetchWeb呼叫fetchWeb', async function() {
        let t = await wi.fetchWeb('abc', { showLog: false })
        let r = [t.status, t.message]
        let rr = ['error', 'invalid url (must be http/https)']
        assert.strict.deepEqual(r, rr)
    })

})
