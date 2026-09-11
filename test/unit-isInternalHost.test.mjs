import assert from 'assert'
import map from 'lodash-es/map.js'
import isInternalHost from '../src/isInternalHost.mjs'


//內網位址判別。
//
//**本檔一律以 `new URL(...).hostname` 為輸入，不以字面值。**
//這不是風格偏好，是本模組第一版被繞過的直接原因：IPv4-mapped 那條寫成
//`/::ffff:(\d+\.\d+\.\d+\.\d+)$/`（點分十進位），而唯一的呼叫端傳進來的是
//`new URL(target).hostname`，WHATWG 之 IPv6 序列化恆輸出十六進位：
//
//    new URL('http://[::ffff:127.0.0.1]/x').hostname  →  '[::ffff:7f00:1]'
//
//於是該分支對所有真實輸入恆不成立（死碼），而以字面值寫的測試卻是綠的——
//測試驗到的是一條 production 永遠走不到的路。
//全域 §15.2「測試是規格的翻譯，不是現狀的指紋」；本專案經驗二之 2「fixture 照真實頁面寫，不可照實作寫」
let hostOf = (h) => new URL('http://' + h + '/x').hostname


describe('內網位址判別', function() {

    let check = (list) => map(list, (h) => [h, isInternalHost(hostOf(h))])
    let expect = (list, want) => map(list, (h) => [h, want])

    describe('IPv6 之各種書寫形態同解(繞過回歸)', function() {

        it('IPv4-mapped 之點分與十六進位兩種寫法皆判為內網', function() {

            //同一個位址兩種書寫, 此前只擋得住其中一種——而 production 走的是另一種
            let list = [
                '[::ffff:127.0.0.1]',
                '[::ffff:7f00:1]',
                '[0:0:0:0:0:ffff:127.0.0.1]',
                '[::ffff:169.254.169.254]',
                '[::ffff:a9fe:a9fe]',
                '[::ffff:10.0.0.1]',
                '[::ffff:192.168.1.1]',
            ]
            let r = check(list)
            let rr = expect(list, true)
            assert.strict.deepEqual(r, rr)
        })

        it('IPv4-compatible 與 NAT64 亦還原末32位元後判定', function() {
            let list = ['[::127.0.0.1]', '[::10.0.0.1]', '[64:ff9b::7f00:1]', '[64:ff9b::a9fe:a9fe]']
            let r = check(list)
            let rr = expect(list, true)
            assert.strict.deepEqual(r, rr)
        })

        it('loopback、未指定、unique-local、link-local', function() {
            let list = ['[::1]', '[::]', '[fd00::1]', '[fc00::1]', '[fe80::1]', '[fe80::abcd:1234]']
            let r = check(list)
            let rr = expect(list, true)
            assert.strict.deepEqual(r, rr)
        })

        it('公開 IPv6 不得誤擋', function() {

            //Google DNS 與 Cloudflare DNS 之 IPv6; 誤擋它們代表判準過寬
            let list = ['[2001:4860:4860::8888]', '[2606:4700:4700::1111]', '[2a00:1450:4001:800::200e]']
            let r = check(list)
            let rr = expect(list, false)
            assert.strict.deepEqual(r, rr)
        })

        it('IPv4-mapped 之公開位址不得誤擋', function() {

            //末32位元還原後若是公開位址, 就是公開位址
            let list = ['[::ffff:8.8.8.8]', '[::ffff:808:808]']
            let r = check(list)
            let rr = expect(list, false)
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('IPv4', function() {

        it('迴環、私有、link-local、CGNAT、0.0.0.0 皆判為內網', function() {
            let list = [
                '127.0.0.1', '127.1.2.3', '0.0.0.0',
                '10.0.0.5', '10.255.255.254',
                '172.16.0.1', '172.31.255.254',
                '192.168.1.1', '169.254.169.254', '100.64.0.1',
            ]
            let r = check(list)
            let rr = expect(list, true)
            assert.strict.deepEqual(r, rr)
        })

        it('邊界外側仍為公開', function() {
            let list = ['172.15.0.1', '172.32.0.1', '11.0.0.1', '9.255.255.255', '100.128.0.1', '8.8.8.8']
            let r = check(list)
            let rr = expect(list, false)
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('主機名', function() {

        it('localhost 與內網後綴判為內網', function() {
            let list = ['localhost', 'sub.localhost', 'printer.local', 'db.internal', 'x.localdomain']
            let r = check(list)
            let rr = expect(list, true)
            assert.strict.deepEqual(r, rr)
        })

        it('單標籤主機名判為內網', function() {

            //http://intranet/ 一類無法是公開站台
            let list = ['intranet', 'metadata', 'router']
            let r = check(list)
            let rr = expect(list, true)
            assert.strict.deepEqual(r, rr)
        })

        it('一般網域為公開', function() {
            let list = ['example.com', 'www.example.com', 'news.google.com', 'a.b.c.example.co.uk']
            let r = check(list)
            let rr = expect(list, false)
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('輸入邊界', function() {

        it('非字串一律視為內網(寧可不提取)', function() {
            let r = map([null, undefined, '', 123, {}], isInternalHost)
            let rr = map([1, 2, 3, 4, 5], () => true)
            assert.strict.deepEqual(r, rr)
        })

        it('含冒號卻解不出IPv6者視為內網', function() {

            //形態不明者於推導路徑上寧可不提取
            let r = map(['[:::1]', '[1:2:3]', '[gggg::1]'], isInternalHost)
            let rr = [true, true, true]
            assert.strict.deepEqual(r, rr)
        })

    })

})
