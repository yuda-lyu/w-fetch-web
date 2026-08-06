import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'
import getFiles from 'w-package-tools/src/getFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'


rollupFiles({
    fns: 'WFetchWeb.mjs',
    fdSrc,
    fdTar,
    nameDistType: 'kebabCase',
    globals: {
        'child_process': 'child_process',
        'util': 'util',
        'path': 'path',
        'module': 'module',
        '@mozilla/readability': '@mozilla/readability',
        'jsdom': 'jsdom',
        'playwright': 'playwright',
    },
    external: [
        'child_process',
        'util',
        'path',
        'module',
        '@mozilla/readability',
        'jsdom',
        'playwright',
    ],
})
