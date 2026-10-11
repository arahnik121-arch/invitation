<#
  Деплой приглашения в существующий кластер (тот же, где idem), неймспейс "invitation".
  Без Argo: обычный kubectl apply.

  Запуск из папки invitation:
    powershell -ExecutionPolicy Bypass -File .\deploy.ps1
  Параметры:
    -RefNamespace idem      неймспейс, у чьего ингресса взять класс и cert-manager issuer
    -Context my-ctx         kubectl-контекст (если текущий не тот)
#>
param(
  [string]$RefNamespace = "idem",
  [string]$Context = "",
  [string]$HostName = "best-invitation.corgi-joy.uk"
)

$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
Set-Location $PSScriptRoot

function Fail($msg) { Write-Host "`n[ОШИБКА] $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { Fail "kubectl не найден в PATH" }
if ($Context) { kubectl config use-context $Context | Out-Null; if ($LASTEXITCODE) { Fail "Нет контекста $Context" } }

Step "Кластер: $(kubectl config current-context)"

# --- 1. Подсматриваем настройки ингресса idem ---
Step "Ищу ингресс-образец (idem)"
$all = (kubectl get ingress -A -o json | Out-String | ConvertFrom-Json).items
if (-not $all) { Fail "В кластере нет ни одного Ingress - не с чего брать настройки" }

$ref = $all | Where-Object { $_.metadata.namespace -eq $RefNamespace } | Select-Object -First 1
if (-not $ref) { $ref = $all | Where-Object { ($_.metadata.namespace + ' ' + ($_.spec.rules.host -join ' ')) -match 'idem' } | Select-Object -First 1 }
if (-not $ref) {
  Write-Host "Ингресс idem не найден. Есть такие:" -ForegroundColor Yellow
  $all | ForEach-Object { Write-Host ("  {0}/{1}  {2}" -f $_.metadata.namespace, $_.metadata.name, ($_.spec.rules.host -join ', ')) }
  Fail "Запусти снова с -RefNamespace <неймспейс из списка>"
}

$class = $ref.spec.ingressClassName
if (-not $class) { $class = $ref.metadata.annotations.'kubernetes.io/ingress.class' }
$issuer = $ref.metadata.annotations.'cert-manager.io/cluster-issuer'
$lb = $ref.status.loadBalancer.ingress | Select-Object -First 1
$ip = $lb.ip; $lbHost = $lb.hostname

Write-Host ("  образец:        {0}/{1}" -f $ref.metadata.namespace, $ref.metadata.name)
Write-Host ("  ingressClass:   {0}" -f $(if ($class) { $class } else { "(по умолчанию)" }))
Write-Host ("  cluster-issuer: {0}" -f $(if ($issuer) { $issuer } else { "(нет - будет без TLS от cert-manager)" }))
Write-Host ("  внешний адрес:  {0}" -f $(if ($ip) { $ip } elseif ($lbHost) { $lbHost } else { "(не найден)" }))

# --- 2. Готовим манифест ---
$yaml = Get-Content -Raw -Encoding UTF8 k8s/app.yaml
$yaml = $yaml -replace 'best-invitation\.corgi-joy\.uk', $HostName
if ($class) { $yaml = $yaml -replace 'ingressClassName: nginx', "ingressClassName: $class" }
else        { $yaml = $yaml -replace '(?m)^\s*ingressClassName: nginx\s*\r?\n', '' }
if ($issuer) {
  $yaml = $yaml -replace 'cluster-issuer: letsencrypt-prod', "cluster-issuer: $issuer"
} else {
  $yaml = $yaml -replace '(?m)^\s*cert-manager\.io/cluster-issuer:.*\r?\n', ''
  $yaml = $yaml -replace '(?ms)^  tls:\s*\r?\n.*?secretName: invitation-tls\s*\r?\n', ''
  $yaml = $yaml -replace '(?m)^  annotations:\s*\r?\n(\s*#.*\r?\n)*', ''
}
$tmp = Join-Path $env:TEMP "invitation-app.yaml"
[IO.File]::WriteAllText($tmp, $yaml, $utf8)

# --- 3. Применяем ---
Step "kubectl apply (неймспейс invitation)"
kubectl apply -f $tmp
if ($LASTEXITCODE) { Fail "kubectl apply не прошёл" }

# --- 4. Секрет с паролем приложения Gmail ---
kubectl -n invitation get secret invitation-mail *> $null
if ($LASTEXITCODE) {
  Step "Нужен пароль приложения Gmail (https://myaccount.google.com/apppasswords)"
  $sec = Read-Host "Вставь пароль приложения для arahnik121@gmail.com" -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)) -replace '\s', ''
  if ($plain.Length -lt 16) { Fail "Пароль приложения - 16 символов. Похоже, вставилось что-то не то." }
  kubectl -n invitation create secret generic invitation-mail `
    --from-literal=SMTP_USER=arahnik121@gmail.com `
    --from-literal=SMTP_PASS=$plain `
    --from-literal=MAIL_TO_HIM=arahnik121@gmail.com `
    --from-literal=MAIL_TO_HER=kate.buryleva@gmail.com | Out-Null
  $plain = $null
  if ($LASTEXITCODE) { Fail "Не удалось создать секрет" }
  kubectl -n invitation rollout restart deploy/invitation | Out-Null
} else {
  Write-Host "Секрет invitation-mail уже есть - не трогаю."
}

Step "Жду запуска пода"
kubectl -n invitation rollout status deploy/invitation --timeout=120s
if ($LASTEXITCODE) {
  kubectl -n invitation get pods
  Write-Host "`nЕсли статус ImagePullBackOff: GitHub -> Packages -> invitation -> Package settings -> Change visibility -> Public," -ForegroundColor Yellow
  Write-Host "и убедись, что GitHub Actions собрал образ (вкладка Actions в репозитории). Потом: kubectl -n invitation rollout restart deploy/invitation" -ForegroundColor Yellow
  exit 1
}

# --- 5. DNS ---
$sub = $HostName.Split('.')[0]
Step "Готово. Теперь DNS у регистратора corgi-joy.uk"
if ($ip)          { Write-Host "  Создай A-запись:     $sub  ->  $ip" -ForegroundColor Green }
elseif ($lbHost)  { Write-Host "  Создай CNAME-запись: $sub  ->  $lbHost" -ForegroundColor Green }
else              { Write-Host "  Укажи запись $sub на тот же адрес, что и у домена idem." -ForegroundColor Green }
Write-Host "  (в Cloudflare - сначала серое облако 'DNS only', пока не выпишется сертификат)"
if ($issuer) { Write-Host "  Проверить сертификат: kubectl -n invitation get certificate   (READY = True)" }
Write-Host "  Открыть:  https://$HostName"
Write-Host "`n  Удалить всё потом:  kubectl delete namespace invitation`n"
