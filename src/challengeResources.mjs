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
let CHALLENGE_RESOURCES = [
    '/cdn-cgi/challenge-platform',
    'challenges.cloudflare.com',
    'hcaptcha.com',
]


//有頭模式偵測驗證iframe之選擇器
//
//前三項由CHALLENGE_RESOURCES衍生，末項為Turnstile之容器class——它不是資源位址，
//故不列入上表（上表用於比對文件內文，class名放進去會與Turnstile判識器重複）。
//此陣列之順序有語意：_tryClickVerification取第一個命中且有boundingBox者
let VERIFY_SELECTORS = [
    ...CHALLENGE_RESOURCES.map((v) => `iframe[src*="${v}"]`),
    '.cf-turnstile iframe',
]


export {
    CHALLENGE_RESOURCES,
    VERIFY_SELECTORS
}
