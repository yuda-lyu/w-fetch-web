import assert from 'assert'
import map from 'lodash-es/map.js'
import { checkHttpStatus } from '../src/httpStatus.mjs'


//HTTP狀態判準之單一擁有者測試。
//
//此判準先前只存在於fetchWebByCurl內, 於是只有curl階看得到HTTP狀態;
//playwright兩階丟棄page.goto()之Response, 實測同一個回500與404的網址,
//curl回error/http-error而playwright回success並帶回錯誤頁HTML。
//對稱性回歸見 api-httpStatus
describe('HTTP狀態判準', function() {

    it('2xx與3xx不視為失敗', function() {
        let r = map([200, 201, 204, 301, 302, 304, 399], checkHttpStatus)
        let rr = map([1, 2, 3, 4, 5, 6, 7], () => null)
        assert.strict.deepEqual(r, rr)
    })

    it('4xx視為失敗且不重試', function() {

        //請求本身有問題, 再抓一次只是重複同一個錯誤
        let r = map([400, 401, 403, 404, 410, 451], (v) => [checkHttpStatus(v).reason, checkHttpStatus(v).retryable])
        let rr = map([1, 2, 3, 4, 5, 6], () => ['http-error', false])
        assert.strict.deepEqual(r, rr)
    })

    it('5xx視為失敗且可重試', function() {
        let r = map([500, 502, 503, 504], (v) => [checkHttpStatus(v).reason, checkHttpStatus(v).retryable])
        let rr = map([1, 2, 3, 4], () => ['http-error', true])
        assert.strict.deepEqual(r, rr)
    })

    it('429為4xx中唯一可重試者', function() {

        //限流為暫時性狀態, 退避後再抓有機會成功; 其餘4xx則否
        let r = [checkHttpStatus(429).retryable, checkHttpStatus(428).retryable, checkHttpStatus(430).retryable]
        let rr = [true, false, false]
        assert.strict.deepEqual(r, rr)
    })

    it('取不到狀態碼時不視為失敗', function() {

        //playwright於同頁錨點導航等情形會回null response;
        //貿然判失敗會把本來抓得到的頁面擋掉, 寧可放行交由後續判識處理
        let r = map([0, null, undefined, NaN], checkHttpStatus)
        let rr = map([1, 2, 3, 4], () => null)
        assert.strict.deepEqual(r, rr)
    })

    it('失敗物件帶回原狀態碼與可讀訊息', function() {
        let t = checkHttpStatus(503)
        let r = [t.httpCode, t.message]
        let rr = [503, 'HTTP 503']
        assert.strict.deepEqual(r, rr)
    })

})
