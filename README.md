# best-invitation.corgi-joy.uk

Приглашение на свидание в DARK MATTER Berlin в стиле сайта музея: чёрный бархат, кинетическая световая решётка, которая в финале собирается в сердце.

**Сценарий:** интро → «Пойдёшь со мной на свидание?» (кнопка «нет» убегает и через 7 попыток уходит «на техобслуживание») → календарь (пн/вт погашены — музей закрыт) + время суток + пожелания → «билет».
После подтверждения уходят два письма с приложенным `.ics`:
- **тебе** (`arahnik121@gmail.com`) — дата, время, часы работы музея, **пожелания**, кнопка на покупку билетов;
- **ей** (`kate.buryleva@gmail.com`) — «билет» с датой и копией её пожеланий.

## Структура

```
public/            сайт (index.html, styles.css, app.js)
server.js          Node-сервер: статика + POST /api/rsvp → письма через SMTP
Dockerfile
k8s/app.yaml       Namespace + Deployment + Service + Ingress (TLS)
k8s/secret.example.yaml
k8s/cluster-issuer.yaml   Let's Encrypt для cert-manager (если ещё нет)
k8s/cloudflared.yaml      вариант без Ingress — через Cloudflare Tunnel
.github/workflows/docker.yml   сборка образа в ghcr.io при пуше в main
```

## 1. Пароль приложения Gmail

Письма уходят с твоего Gmail. Обычный пароль не подойдёт:
включи 2FA → https://myaccount.google.com/apppasswords → создай пароль (16 символов).

## 2. Локальная проверка

```bash
npm install
npm run dev            # DRY_RUN: письма печатаются в консоль, никуда не уходят
# открыть http://localhost:8080
```

С настоящей отправкой: `SMTP_USER=arahnik121@gmail.com SMTP_PASS='xxxx xxxx xxxx xxxx' npm start`

## 3. Образ

Пуш в `main` → GitHub Actions соберёт `ghcr.io/arahnik121-arch/invitation:latest` (amd64 + arm64).
Если кластер не может скачать образ (ImagePullBackOff): GitHub → твой профиль → Packages → `invitation` → Package settings → Change visibility → **Public**.

## 4. Деплой в Kubernetes

```bash
kubectl apply -f k8s/app.yaml          # создаст namespace invitation и всё остальное
kubectl -n invitation create secret generic invitation-mail \
  --from-literal=SMTP_USER=arahnik121@gmail.com \
  --from-literal=SMTP_PASS='xxxx xxxx xxxx xxxx'
kubectl -n invitation rollout restart deploy/invitation
kubectl -n invitation get pods
```

### Вариант А: Ingress + Let's Encrypt
1. Проверь класс ingress: `kubectl get ingressclass` — и поправь `ingressClassName` в `k8s/app.yaml` (и в `cluster-issuer.yaml`), если не `nginx`.
2. Если нет cert-manager:
   `kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml`
   затем `kubectl apply -f k8s/cluster-issuer.yaml`.
3. Узнай внешний IP контроллера: `kubectl get svc -A | grep -i LoadBalancer`.
4. У регистратора corgi-joy.uk добавь **A-запись**: `best-invitation` → этот IP.
   (Если DNS в Cloudflare — сначала с серым облаком «DNS only», чтобы Let's Encrypt выдал сертификат.)
5. Через пару минут: `kubectl -n invitation get certificate` → `READY True`.

### Вариант Б: Cloudflare Tunnel (нет внешнего IP / ingress)
См. инструкцию в начале `k8s/cloudflared.yaml`. Сертификат и DNS-запись Cloudflare сделает сам.

## 5. Проверка перед отправкой жене

Пройди сценарий сам и выбери дату — оба письма придут (одно и ей тоже, так что лучше проверить с `DRY_RUN=1` локально или временно подставить свой адрес в `MAIL_TO_HER` в секрете).

## 6. Удаление

```bash
kubectl delete namespace invitation
```
И удали A-запись `best-invitation` у регистратора. Пароль приложения Gmail можно отозвать там же, где создавал.
