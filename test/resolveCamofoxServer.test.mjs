import assert from 'assert'
import { existsSync, readFileSync } from 'fs'
import { basename, dirname } from 'path'
import endsWith from 'lodash-es/endsWith.js'
import includes from 'lodash-es/includes.js'
import resolveCamofoxServer from '../src/resolveCamofoxServer.mjs'


describe('resolveCamofoxServer', function() {

    it('解析出已安裝之@askjo/camofox-browser之server.js絕對路徑', function() {
        let fp = resolveCamofoxServer()
        let r = [
            typeof fp,
            basename(fp),
            endsWith(dirname(fp).replace(/\\/g, '/'), 'node_modules/@askjo/camofox-browser'),
            existsSync(fp),
        ]
        let rr = ['string', 'server.js', true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('解析結果之套件目錄含camofox.config.json, 可直接作為spawn之cwd', function() {
        let fd = dirname(resolveCamofoxServer())
        let r = [
            existsSync(fd + '/camofox.config.json'),
            existsSync(fd + '/package.json'),
        ]
        let rr = [true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('server.js無任何export且於top-level即listen, 故只能spawn不可直接import', function() {

        //本斷言用以固定「不可改為import」之前提, 前提若變動須同步檢討fetchWebByCamofox實作
        let code = readFileSync(resolveCamofoxServer(), 'utf8')
        let r = [
            /^export /m.test(code),
            includes(code, 'app.listen('),
        ]
        let rr = [false, true]
        assert.strict.deepEqual(r, rr)
    })

})
