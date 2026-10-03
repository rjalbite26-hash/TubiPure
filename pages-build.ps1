param(
    [string] $BasePath = '/TubiPure'
)

$ErrorActionPreference = 'Stop'

$BasePath = '/' + $BasePath.Trim('/')
$SiteUrl = "https://rjalbite26-hash.github.io$BasePath"

npm run build
if ($LASTEXITCODE -ne 0) {
    throw 'Vite build failed.'
}

$env:APP_KEY = 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$env:APP_URL = $SiteUrl
$env:SESSION_DRIVER = 'array'
$env:CACHE_STORE = 'file'
$env:DB_CONNECTION = 'sqlite'
$env:DB_DATABASE = ':memory:'

$renderCode = @'
require "vendor/autoload.php";
$app = require "bootstrap/app.php";
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$request = Illuminate\Http\Request::create("/", "GET", [], [], [], [
    "HTTP_HOST" => "rjalbite26-hash.github.io",
    "HTTPS" => "on",
    "SERVER_PORT" => 443,
]);
$response = $kernel->handle($request);
if ($response->getStatusCode() !== 200) {
    fwrite(STDERR, "Laravel returned HTTP {$response->getStatusCode()}.\n");
    exit(1);
}
echo $response->getContent();
'@

$html = (& php -r $renderCode | Out-String)
if ($LASTEXITCODE -ne 0) {
    throw 'Laravel failed to render the homepage.'
}

$html = $html.Replace('http://localhost/', "$BasePath/")
$html = $html.Replace('https://localhost/', "$BasePath/")
$html = $html.Replace('https://rjalbite26-hash.github.io/', "$SiteUrl/")
$html = [regex]::Replace($html, '((?:href|src|action)=["''])/(?!/)', "`$1$BasePath/")
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'index.html'), $html, [System.Text.UTF8Encoding]::new($false))

Copy-Item (Join-Path $PSScriptRoot 'public/build/*') (Join-Path $PSScriptRoot 'build') -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot 'public/images/*') (Join-Path $PSScriptRoot 'images') -Recurse -Force

Get-ChildItem (Join-Path $PSScriptRoot 'build/assets') -Filter '*.css' -File | ForEach-Object {
    $css = Get-Content $_.FullName -Raw
    $css = $css.Replace('/images/', "$BasePath/images/")
    [System.IO.File]::WriteAllText($_.FullName, $css, [System.Text.UTF8Encoding]::new($false))
}

New-Item -Path (Join-Path $PSScriptRoot '.nojekyll') -ItemType File -Force | Out-Null
Write-Output "GitHub Pages site generated at $SiteUrl"
