import estimateVisibleText from './estimateVisibleText.mjs'


//可見文字低於此字數才啟動Shadow DOM穿透
let SHADOW_VISIBLE_THRESHOLD = 200

//Shadow DOM取得之文字低於此字數視為無效, 仍回傳原HTML
let SHADOW_MIN_CHARS = 50


//轉義HTML特殊字元
function _esc(s) {
    return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
}


/**
 * 由Playwright之page提取網頁HTML，可見文字過少時穿透Shadow DOM
 *
 * 先取page.content()，若估算可見文字已達門檻則直接回傳；否則遞迴穿透Shadow DOM取得
 * 各層innerText，再依換行切段重組為含article之簡易HTML，供Readability解析
 *
 * @param {Object} page 輸入Playwright之page物件
 * @returns {Promise} 回傳Promise，resolve回傳網頁HTML字串
 * @example
 *
 * import { chromium } from 'playwright'
 * import extractPageContent from './src/extractPageContent.mjs'
 *
 * let test = async () => {
 *
 *     let browser = await chromium.launch({ headless: true, channel: 'chrome' })
 *     let page = await browser.newPage()
 *     await page.goto('https://example.com/')
 *     let html = await extractPageContent(page)
 *     console.log(html.length)
 *     // => 234
 *     await browser.close()
 *
 * }
 * await test()
 *     .catch((err) => {
 *         console.log(err)
 *     })
 *
 */
async function extractPageContent(page) {

    let html = await page.content()
    let visible = estimateVisibleText(html)
    if (visible.length >= SHADOW_VISIBLE_THRESHOLD) {
        return html
    }

    //穿透Shadow DOM
    let shadow = await page.evaluate(() => {
        function getDeepInnerText(el) {
            if (!el) {
                return ''
            }
            let text = ''
            if (el.shadowRoot) {
                for (let child of el.shadowRoot.children) {
                    text += getDeepInnerText(child)
                }
                return text
            }
            if (el.children && el.children.length > 0) {
                for (let child of el.children) {
                    text += getDeepInnerText(child)
                }
                return text
            }
            return el.innerText || ''
        }
        return getDeepInnerText(document.body || document.documentElement)
    })

    if (!shadow || shadow.length < SHADOW_MIN_CHARS) {
        return html
    }

    //由Shadow DOM內文重組為簡易HTML
    let title = await page.title().catch(() => '')
    let titleEsc = _esc(title || '')
    let bodyEsc = _esc(shadow)
    return `<!DOCTYPE html><html><head><title>${titleEsc}</title></head><body><article>${bodyEsc.split(/\n+/).map((p) => `<p>${p}</p>`).join('\n')}</article></body></html>`
}


export default extractPageContent
