# ShopNow Load Balancer

Projeto TDE 4 da cadeira de Sistemas distribuidos 2026.2, balanceamento de carga com Node.js, Docker e Docker Compose.

Acessivel em `http://localhost:8080`.

## Requisitos

- Docker Desktop em execucao.
- Apache Benchmark (`ab`) para os testes de carga.
- Node.js 22+ apenas se quiser executar os arquivos fora do Docker.

## Como executar

Na pasta do projeto:

```powershell
docker compose up -d --build
docker compose ps
```

Aguarde os quatro servicos ficarem saudaveis. Consulte o balanceador:

```powershell
Invoke-RestMethod http://localhost:8080/__status
```

Teste a aplicacao varias vezes:

```powershell
1..9 | ForEach-Object { Invoke-RestMethod http://localhost:8080/ | Select-Object instance }
```

## Trocar o algoritmo

Round Robin:

```powershell
Invoke-RestMethod "http://localhost:8080/__algorithm?name=round-robin"
```

Least Connections:

```powershell
Invoke-RestMethod "http://localhost:8080/__algorithm?name=least-connections"
```

Confira o algoritmo atual:

```powershell
Invoke-RestMethod http://localhost:8080/__status
```

## Simular falha de servidor

Pare a primeira instancia:

```powershell
docker compose stop app1
```

Aguarde alguns segundos e confira:

```powershell
Invoke-RestMethod http://localhost:8080/__status
```

Envie requisicoes:

```powershell
1..9 | ForEach-Object { Invoke-RestMethod http://localhost:8080/ | Select-Object instance }
```

As requisicoes novas devem ser encaminhadas somente para as instancias saudaveis. Repita parando `app2` e depois `app3` (uma por vez). Se todas as instancias estiverem indisponiveis, o balanceador responde HTTP 503.

Reative a instancia:

```powershell
docker compose start app1
```


## Testes de carga

Execute primeiro o algoritmo Round Robin:

```powershell
Invoke-RestMethod "http://localhost:8080/__algorithm?name=round-robin"
```

No terminal WSL:

```bash
ab -n 10000 -c 100 http://localhost:8080/
```

Para salvar o relatorio:

```bash
ab -n 10000 -c 100 http://localhost:8080/ > results/round-robin.txt
```

Teste tambem requisicoes demoradas, que ajudam a observar o Least Connections:

```bash
ab -n 1000 -c 50 "http://localhost:8080/slow?ms=300"
```

Troque para Least Connections no PowerShell:

```powershell
Invoke-RestMethod "http://localhost:8080/__algorithm?name=least-connections"
```


## Encerrar

```powershell
docker compose down
```

Para encerrar e remover tambem os recursos de rede criados pelo Compose:

```powershell
docker compose down --remove-orphans
```