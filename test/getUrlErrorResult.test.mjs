import assert from 'assert'
import map from 'lodash-es/map.js'
import getUrlErrorResult from '../src/getUrlErrorResult.mjs'


describe('getUrlErrorResult', function() {

    it('有效網址回傳null', function() {
        let r = map([
            'https://www.google.com/',
            'http://127.0.0.1:8080/abc',
        ], (v) => getUrlErrorResult(v, 'curl', 'now'))
        let rr = [null, null]
        assert.strict.deepEqual(r, rr)
    })

    it('非有效字串回傳url is required錯誤結果', function() {
        let r = getUrlErrorResult(null, 'curl', 'now')
        let rr = {
            status: 'error',
            url: 'null',
            message: 'url is required (string)',
            reason: 'invalid-url',
            method: 'curl',
            fetchedAt: 'now',
            attempts: 0,
        }
        assert.strict.deepEqual(r, rr)
    })

    it('非http與https網址回傳invalid url錯誤結果', function() {
        let r = getUrlErrorResult('ftp://a.com/', 'camofox', 'now')
        let rr = {
            status: 'error',
            url: 'ftp://a.com/',
            message: 'invalid url (must be http/https)',
            reason: 'invalid-url',
            method: 'camofox',
            fetchedAt: 'now',
            attempts: 0,
        }
        assert.strict.deepEqual(r, rr)
    })

    it('method與fetchedAt原樣寫入結果物件', function() {
        let r = map(['curl', 'playwright-headless', 'playwright-headed', 'camofox'], (v) => {
            let t = getUrlErrorResult('abc', v, 'ts-' + v)
            return [t.method, t.fetchedAt]
        })
        let rr = [
            ['curl', 'ts-curl'],
            ['playwright-headless', 'ts-playwright-headless'],
            ['playwright-headed', 'ts-playwright-headed'],
            ['camofox', 'ts-camofox'],
        ]
        assert.strict.deepEqual(r, rr)
    })

})
