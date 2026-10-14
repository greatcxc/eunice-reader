$ErrorActionPreference = 'Continue'
$pkgs = @('@openfonts/noto-sans-sc_all', '@fontpkg/noto-sans-cjk-sc', '@fontpkg/noto-serif-cjk-sc', 'noto-sans-sc')
foreach ($p in $pkgs) {
    try {
        $j = Invoke-RestMethod -Uri "https://registry.npmjs.org/$([uri]::EscapeDataString($p))" -Proxy 'http://127.0.0.1:7892' -TimeoutSec 30
        $v = $j.'dist-tags'.latest
        $pj = $j.versions.$v
        $mb = [math]::Round($pj.dist.unpackedSize / 1MB, 1)
        $lic = '?'
        if ($pj.license) {
            if ($pj.license -is [string]) { $lic = $pj.license } else { $lic = $pj.license.type }
        }
        "{0,-34} v{1,-9} {2,8} MB  license={3}" -f $p, $v, $mb, $lic
    }
    catch {
        "{0,-34} ERR {1}" -f $p, $_.Exception.Message
    }
}