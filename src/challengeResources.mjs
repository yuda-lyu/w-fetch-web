//反爬蟲挑戰元件之特徵：本模組為其單一擁有者
//
//同一份知識先前存在兩處形態不同的複本——判識器用字串比對（inspectHtml），
//有頭模式用CSS選擇器點擊（fetchWebByPlaywrightHead）。兩處各自維護，
//新增一種挑戰服務要記得改兩個地方；且其中一處的註解已寫明「與另一處同源」卻仍是複製的
//
//注意不可把資源位址放寬為'/cdn-cgi/'：該路徑於一般Cloudflare託管站台亦大量存在
//（email-decode、rocket-loader等），放寬會把正常頁面判成攔阻頁


//挑戰元件本身之資源位址
//順序即為有頭模式之點擊優先序（見VERIFY_SELECTORS）
//
//reCAPTCHA以路徑片段而非網域比對：其api.js與iframe分別可來自www.google.com與recaptcha.net
//兩個網域，`/recaptcha/`同時涵蓋兩者。刻意不用裸字'recaptcha'——那會命中內文提及該字之文章，
//亦會命中容器class`g-recaptcha`，而本表之條目同時供VERIFY_SELECTORS組出iframe選擇器，
//裸字會使選擇器過寬。
//此前本表有hcaptcha而無reCAPTCHA，實測reCAPTCHA挑戰頁完全漏判（回pass）而hCaptcha被攔下——
//同一類元件一個涵蓋一個沒有，屬對稱破缺。reCAPTCHA是網路上最常見的CAPTCHA，非推測性風險
let CHALLENGE_RESOURCES = [
    '/cdn-cgi/challenge-platform',
    'challenges.cloudflare.com',
    'hcaptcha.com',
    '/recaptcha/',
]


//有頭模式偵測驗證iframe之選擇器
//
//前面各項由CHALLENGE_RESOURCES衍生，末項為Turnstile之容器class——它不是資源位址，
//故不列入上表（上表用於比對文件內文，class名放進去會與Turnstile判識器重複）。
//此陣列之順序有語意：_tryClickVerification取第一個命中且有boundingBox者
let VERIFY_SELECTORS = [
    ...CHALLENGE_RESOURCES.map((v) => `iframe[src*="${v}"]`),
    '.cf-turnstile iframe',
]


//Cloudflare managed challenge之整頁形態：iframe不在DOM，須經page.frames()比對其來源
//
//此值先前在fetchWebByPlaywrightHead內手寫，是同一份知識的**第三份**複本——
//而本檔第1行自稱「單一擁有者」、檔頭還記著上一次就是從該檔收斂過來的。
//宣告收斂完成卻留下一份沒收，是同一份知識上的第二次同型錯誤（見CLAUDE_experience.md一）
let CF_FRAME_HOST = 'challenges.cloudflare.com'


//Turnstile容器之選擇器
//
//同上，先前在fetchWebByPlaywrightHead內手寫。三個id/class為Cloudflare於不同版型下之容器，
//與VERIFY_SELECTORS末項的差別是：此處要點的是容器本身，該處要點的是容器內的iframe
let TURNSTILE_CONTAINER_SELECTOR = '#turnstile-container, #turnstileWrapper, .cf-turnstile'


export {
    CHALLENGE_RESOURCES,
    VERIFY_SELECTORS,
    CF_FRAME_HOST,
    TURNSTILE_CONTAINER_SELECTOR
}
