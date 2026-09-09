import isstr from 'wsemi/src/isstr.mjs'


/**
 * 將Camofox之accessibility snapshot轉換為簡易HTML
 *
 * 保留heading、paragraph、listitem、strong、emphasis、text、img等語意元素，跳過button、
 * banner、navigation等結構容器標記
 *
 * @param {String} snapshot 輸入accessibility snapshot字串
 * @param {String} [pageTitle=''] 輸入頁面標題字串，預設''
 * @returns {String} 回傳簡易HTML字串
 * @example
 *
 * import snapshotToHtml from './src/snapshotToHtml.mjs'
 *
 * console.log(snapshotToHtml('- heading "abc" [level=1]\n- paragraph: def', 'abc'))
 * // => '<!DOCTYPE html><html><head><title>abc</title></head><body><article><h1>abc</h1>\n<h1>abc</h1>\n<p>def</p></article></body></html>'
 *
 */
function snapshotToHtml(snapshot, pageTitle = '') {

    //check
    if (!isstr(snapshot)) {
        snapshot = ''
    }
    if (!isstr(pageTitle)) {
        pageTitle = ''
    }

    let esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let lines = snapshot.split('\n')
    let htmlParts = []

    for (let line of lines) {

        let trimmed = line.replace(/^ *- */, '').trim()
        if (!trimmed) {
            continue
        }

        //heading "..." [level=N]
        let headingMatch = trimmed.match(/^(?:')?heading\s+"(.+?)"\s*\[level=(\d)\]/)
        if (headingMatch) {
            let lvl = headingMatch[2]
            htmlParts.push(`<h${lvl}>${esc(headingMatch[1])}</h${lvl}>`)
            continue
        }

        //link與/url:皆跳過, 內容由子行處理
        if (/^(?:')?link\s+"/.test(trimmed)) {
            continue
        }
        if (/^\/url:\s+/.test(trimmed)) {
            continue
        }

        //img "alt"
        let imgMatch = trimmed.match(/^img\s+"(.+?)"/)
        if (imgMatch) {
            htmlParts.push(`<img alt="${esc(imgMatch[1])}">`)
            continue
        }

        //paragraph與paragraph: text
        let paraMatch = trimmed.match(/^paragraph(?::\s*(.+))?$/)
        if (paraMatch) {
            if (paraMatch[1]) {
                htmlParts.push(`<p>${esc(paraMatch[1])}</p>`)
            }
            continue
        }

        //listitem與listitem: text
        let liMatch = trimmed.match(/^listitem(?::\s*(.+))?$/)
        if (liMatch) {
            if (liMatch[1]) {
                htmlParts.push(`<li>${esc(liMatch[1])}</li>`)
            }
            continue
        }

        //strong: text
        let strongMatch = trimmed.match(/^strong:\s*"?(.+?)"?\s*$/)
        if (strongMatch) {
            htmlParts.push(`<strong>${esc(strongMatch[1])}</strong>`)
            continue
        }

        //emphasis: text
        let emMatch = trimmed.match(/^emphasis:\s*"?(.+?)"?\s*$/)
        if (emMatch) {
            htmlParts.push(`<em>${esc(emMatch[1])}</em>`)
            continue
        }

        //text: "..."
        let textMatch = trimmed.match(/^text:\s*"?(.+?)"?\s*$/)
        if (textMatch) {
            htmlParts.push(`<span>${esc(textMatch[1])}</span>`)
            continue
        }

        //option "..." (微信附註)
        let optionMatch = trimmed.match(/^(?:')?option\s+"(.+?)"/)
        if (optionMatch) {
            htmlParts.push(`<p>${esc(optionMatch[1])}</p>`)
            continue
        }

        //結構與容器標記皆跳過
        if (/^(button|banner|navigation|main|contentinfo|complementary|list)\b/.test(trimmed)) {
            continue
        }

        //純文字行
        let plainText = trimmed.replace(/\[e\d+\]/g, '').replace(/^['"]|['"]$/g, '').trim()
        if (
            plainText.length > 0 &&
            !/^(link|img|heading|paragraph|listitem|strong|emphasis|text|option|button|banner|navigation|main|contentinfo|complementary|list)\b/.test(plainText)
        ) {
            htmlParts.push(`<p>${esc(plainText)}</p>`)
        }
    }

    let titleEsc = esc(pageTitle)
    return (
        '<!DOCTYPE html><html><head><title>' + titleEsc + '</title></head>' +
        '<body><article><h1>' + titleEsc + '</h1>\n' +
        htmlParts.join('\n') +
        '</article></body></html>'
    )
}


export default snapshotToHtml
