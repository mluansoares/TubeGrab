# TubeGrab

Baixe **vídeo (MP4)** ou **áudio (MP3)** do YouTube colando um link. Roda no seu computador, com interface web moderna — nada é enviado para nuvem nenhuma.

```
Cole o link  →  escolha a qualidade  →  baixe
```

---

## O que ele faz

- **MP4** com vídeo + áudio já juntados, priorizando H.264 (toca em qualquer navegador, celular e editor).
- **MP3** de 128, 192 ou 320 kbps, com metadados embutidos.
- Escolha de resolução (144p até 4K, conforme o vídeo oferecer) e tamanho estimado antes de baixar.
- Fila de downloads com progresso, velocidade e tempo restante em tempo real.
- Cancelar, baixar de novo, abrir a pasta no Explorador e apagar arquivos.
- Player embutido para conferir o arquivo antes de usar.
- Histórico persistente (SQLite) e limpeza automática de arquivos antigos.
- Mensagens de erro em português explicando **o que fazer** (vídeo privado, bot check, 403, disco cheio…).

## Requisitos

| Item | Versão |
|---|---|
| Node.js | 22.5 ou superior (testado no 24) |
| Windows, macOS ou Linux | — |
| ~150 MB de disco | para yt-dlp + ffmpeg |
| Conexão com a internet | para baixar e para o próprio download |

O app baixa sozinho o `yt-dlp` e o `ffmpeg` — você não precisa instalar nada além do Node.

> No Windows, o **`TubeGrab.exe`** cuida do Node e dos binários por você (veja *Windows: um clique* abaixo). Os requisitos acima valem para o fluxo manual com `npm`.

---

## Instalação

```bash
cd YoutubeVideoDownloader
npm install
npm run setup     # baixa yt-dlp + ffmpeg para bin/  (~130 MB, uma vez só)
npm start
```

Abra **http://localhost:3100**.

No dia a dia, só `npm start` é necessário.

### Windows: um clique (sem terminal)

Na raiz do projeto fica **`TubeGrab.exe`** — é o único arquivo em que você precisa clicar. Ele é um launcher fino (~20 KB): não contém a lógica do app, apenas abre `launcher\TubeGrab.bat` do mesmo jeito que um duplo clique abriria.

```
TubeGrab.exe
   └─ launcher\TubeGrab.bat
        ├─ 1. Node.js + npm          (instala o LTS se faltar ou for antigo)
        ├─ 2. node_modules\          (npm install se faltar)
        ├─ 3. bin\yt-dlp + ffmpeg    (npm run setup se faltar — ~130 MB)
        ├─ 4. npm start              (servidor em http://127.0.0.1:<PORT>)
        └─ 5. navegador padrão       (abre quando a porta responde)
```

#### Primeira execução

1. Baixe o projeto **inteiro**: `git clone` (recomendado) ou **Code → Download ZIP**. Se for ZIP, extraia a pasta antes; não execute de dentro do `.zip` e não mova só o `.exe`.
2. Duplo clique em **`TubeGrab.exe`**.
3. Uma janela de console abre e mostra o progresso:
   - `[1/4]` Node.js e npm — se faltar (ou for anterior ao 22.5), tenta instalar o LTS via `winget` e, se não der, baixa o instalador oficial do nodejs.org;
   - `[2/4]` dependências do projeto — `npm install` só na primeira vez;
   - `[3/4]` `yt-dlp` + `ffmpeg` — `npm run setup` baixa ~130 MB na primeira vez (pode levar alguns minutos);
   - `[4/4]` servidor — `npm start` e abertura do navegador.
4. Quando aparecer `TubeGrab no ar → http://localhost:<PORT>`, a aba já deve estar aberta. Se não estiver, abra o endereço na mão.
5. **Deixe o console aberto** — é ele que mantém o servidor rodando. Fechar a janela encerra o app.

Nas próximas vezes é o mesmo duplo clique. Se o app já estiver rodando na mesma porta, o script avisa `o TubeGrab ja esta rodando na porta 3100` e só abre a aba, sem subir uma segunda instância.

A porta vem do `.env` (padrão `3100`). A partir da segunda execução o console mostra `ok - ja instaladas` e `ok - ja instalados` — é o caminho normal, sem download nenhum.

> Requisitos: Windows 10/11 (o .NET Framework 4 já vem no sistema). Não precisa de Visual Studio nem de SDK. Conexão com a internet é necessária na primeira vez.

#### O que mudou: por que não existe mais `TubeGrab.lnk`

O atalho `.lnk` antigo foi aposentado porque **não é versionável**: ele guarda o caminho absoluto (`G:\...\launcher\TubeGrab.bat`) e o serial do volume de origem dentro do binário. Quem clonasse o repositório em outra pasta receberia um atalho apontando para um caminho inexistente.

O `TubeGrab.exe` resolve isso: o ícone e os metadados (`TubeGrab`, versão `1.0.0.0`) estão **embutidos no executável**, e o caminho do `.bat` é calculado em tempo de execução a partir da pasta onde o `.exe` está. Não há caminho absoluto gravado, então o projeto funciona em qualquer diretório.

O `launcher\TubeGrab.bat` continua no repositório e **funciona sozinho**, sem o `.exe` — útil se o executável for bloqueado por política de máquina ou se você preferir rodar num terminal.

> **Já usava o projeto?** Depois do `git pull` (ou de copiar os arquivos novos), o `TubeGrab.exe` aparece na raiz. O `TubeGrab.lnk` antigo pode ser apagado da pasta. Atalhos na Área de Trabalho que apontavam para o `.lnk` param de funcionar — recrie-os apontando para `TubeGrab.exe`. Nada mais muda: `.env`, `node_modules/`, `bin/`, `storage/` e `data/` continuam iguais.

#### Antivírus, SmartScreen e o binário

O binário é gerado a partir de `launcher\TubeGrabLauncher.cs` (código aberto, ~40 linhas) e é commitado junto do script de build. Não há ofuscação, empacotamento, janela oculta nem comando montado em string — justamente o que costuma disparar heurísticas. Ainda assim:

- **`git clone`** não aplica *Mark of the Web*: normalmente abre direto.
- **ZIP baixado do GitHub** marca os arquivos; o Windows pode mostrar *"O Windows protegeu o computador"* → **Mais informações → Executar assim mesmo**.
- Um antivírus pode implicar com qualquer `.exe` pequeno e não assinado. Se acontecer, use `launcher\TubeGrab.bat` (mesmo comportamento) ou adicione uma exclusão para a pasta do projeto.
- Binário **não assinado**: não há certificado de code signing. Assinar resolveria o SmartScreen, mas exige certificado pago.

Para auditar o binário commitado:

```
SHA-256  4D98A0280C9F51A494ED2B84ED688D1B0029118CE450BEFDD04A43C5EDC36815
tamanho  19.968 bytes
```

Confira na sua máquina com:

```powershell
Get-FileHash .\TubeGrab.exe -Algorithm SHA256
```

> Esse hash vale para o binário atual do repositório. Se você recompilar, o seu será diferente — o script imprime o resultado. Dá para conferir o hash publicado aqui com o do seu arquivo (ou enviá-lo ao VirusTotal) antes de executar.

Para recompilar (não precisa de SDK, Visual Studio nem internet — usa o `csc.exe` do .NET Framework que já vem no Windows 10/11):

```bat
powershell -ExecutionPolicy Bypass -File launcher\build-exe.ps1
```

O script recria o `TubeGrab.exe` na raiz com o ícone e os metadados. Se der certo, termina com `ok - TubeGrab.exe (... bytes)`.

#### Se o executável não funcionar

| Sintoma | Causa provável | Vá para |
|---|---|---|
| Nada acontece no duplo clique | SmartScreen ou política de execução bloqueando | 1 |
| "O Windows protegeu o computador" | *Mark of the Web* (ZIP) ou reputação | 1 |
| Antivírus apaga ou põe em quarentena | heurística em `.exe` não assinado | 2 |
| Caixa "Nao encontrei launcher\TubeGrab.bat" | `.exe` fora da raiz ou ZIP extraído pela metade | 3 |
| Console abre e fecha na hora | o `.bat` nem chegou a rodar (bloqueio/política) | 4 |
| Console para em `[1/4]`, `[2/4]` ou `[3/4]` | Node, rede/proxy ou disco | 5 |
| Servidor no ar, navegador não abre | porta diferente ou navegador sem associação | 6 |
| `EADDRINUSE` / porta ocupada | instância anterior ainda rodando | 7 |
| `.exe` sumiu, corrompeu ou nada resolve | — | 8 |

**1. SmartScreen ou "Windows protegeu o computador".**
Clique em **Mais informações → Executar assim mesmo**. Se o botão não existir, clique com o botão direito no `TubeGrab.exe` → **Propriedades** → marque **Desbloquear** → **Aplicar**. No PowerShell, o equivalente é:

```powershell
Unblock-File .\TubeGrab.exe
```

Se o Windows não oferecer nenhuma dessas opções, é política da máquina (AppLocker/antivírus corporativo): use o item 2 ou o 4.

**2. O antivírus bloqueou, apagou ou colocou em quarentena.**
Abra o histórico/quarentena do antivírus, restaure o arquivo e adicione uma exclusão para a pasta do projeto. Antes de liberar, confira o hash (seção acima) e, se quiser, envie o arquivo ao VirusTotal. Você também pode simplesmente **não usar o `.exe`**: `launcher\TubeGrab.bat` faz exatamente a mesma coisa. Não baixe uma "versão corrigida" de outro lugar.

**3. Apareceu "Nao encontrei launcher\TubeGrab.bat".**
O `.exe` precisa estar na raiz do projeto, ao lado de `package.json`, `README.md` e da pasta `launcher\`. Causas comuns: mover só o `.exe` para a Área de Trabalho, extrair o ZIP pela metade ou renomear a pasta `launcher`. Volte o arquivo para a raiz e mantenha a estrutura.

**4. O console abre e fecha na hora (ou nem abre).**
Se o `.bat` rodasse e falhasse, ele pararia em `pause` com a mensagem na tela — fechar na hora geralmente significa que ele nem foi executado (bloqueio do `.exe`/do `.bat`). Rode o `.bat` num terminal para ver o que acontece. Abra o Prompt/PowerShell **na pasta do projeto** e execute:

```bat
launcher\TubeGrab.bat
```

Se a janela fechar rápido demais, use `cmd /k launcher\TubeGrab.bat`. A mensagem que aparecer é a causa; os casos mais comuns estão nos itens 5 e 7. Se o console mostrar os passos e terminar em `Servidor encerrado`, o `npm start` falhou — o erro está nas linhas acima. Se nem o `.bat` rodar, tente o fluxo manual (item 8) — `npm start` não depende de nada do launcher.

**5. Erro durante os passos do console.**

- `[1/4]` **"Node.js nao ficou disponivel neste console"** — a instalação automática falhou. Instale o **LTS** em [nodejs.org](https://nodejs.org), feche o console, abra de novo e confirme com `node -v` (precisa ser 22.5 ou superior).
- `[2/4]` **falha no `npm install`** — rede, proxy ou antivírus. Rode `npm install` na raiz para ver o erro completo; atrás de proxy, configure `npm config set proxy http://...`.
- `[3/4]` **falha no `npm run setup`** — são ~130 MB. Confira disco e internet e rode de novo; o script retoma o que faltou.
- `[4/4]` **erro do Node** — se for `EADDRINUSE`, veja o item 7. Se mencionar `node:sqlite`, seu Node é antigo: atualize para 22.5+.
- O console **permanece aberto** com a mensagem: copie as últimas linhas antes de pedir ajuda.

**6. O servidor sobe, mas o navegador não abre.**
Abra `http://localhost:3100` (ou a porta do seu `.env`) manualmente. O launcher espera a porta do servidor por até ~60 s; se ela não responder nesse prazo, ele desiste de abrir o navegador. Confira também se existe um navegador padrão associado a links `http://` (Configurações → Aplicativos → Aplicativos padrão) e teste com `start "" http://localhost:3100` no `cmd`.

Se você usa `HOST=0.0.0.0` para acessar de outro aparelho, permita o Node no firewall do Windows (redes privadas) — o bloqueio afeta o acesso externo, não o `localhost`.

**7. Porta ocupada (`EADDRINUSE`).**
Feche o console antigo do TubeGrab. Se não souber qual é, descubra o processo e encerre:

```bat
netstat -ano | findstr :3100
taskkill /PID <numero-do-pid> /F
```

Ou simplesmente mude a porta no `.env` (`PORT=3200`) e rode de novo. O launcher detecta a porta do `.env` automaticamente.

**8. Recompilar ou usar o fluxo manual.**
Se o `.exe` sumiu, foi corrompido ou não há como liberá-lo, recompile (recria o arquivo na raiz):

```bat
powershell -ExecutionPolicy Bypass -File launcher\build-exe.ps1
```

Se o `csc.exe` não for encontrado, instale o .NET Framework 4.8 ou pule esta etapa e use o `.bat`. Último recurso, sem launcher nenhum:

```bash
npm install
npm run setup
npm start
```

Ao pedir ajuda, informe: versão do Windows, `node -v`, a saída de `launcher\TubeGrab.bat` (as últimas linhas) e se o projeto veio de `git clone` ou de ZIP.

## Uso

1. Cole o link do vídeo (aceita `youtube.com/watch`, `youtu.be`, `Shorts`, `live`, `embed` e o ID de 11 caracteres).
2. Clique em **Analisar**.
3. Escolha **Vídeo (MP4)** ou **Áudio (MP3)** e a qualidade.
4. Clique em **Baixar**. O progresso aparece em "Seus downloads".

Os arquivos ficam em `storage/videos/<id-do-job>/<título> [<videoId>].<ext>`.

Botões disponíveis em cada download concluído: **prévia**, **baixar** (o arquivo que já está no disco), **abrir pasta** e **apagar**.

---

## Configuração (`.env`)

Todas as variáveis são opcionais. Copie `.env.example` para `.env` e edite.

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3100` | Porta do servidor. |
| `HOST` | `127.0.0.1` | `127.0.0.1` = só esta máquina. `0.0.0.0` = rede interna. |
| `ACCESS_TOKEN` | *(vazio)* | Se definido, a API passa a exigir esse token. **Use se expor na rede.** |
| `MAX_DURATION_MIN` | `180` | Duração máxima aceita, em minutos. **`0` = sem limite** (qualquer duração). |
| `MAX_FILESIZE_MB` | `4096` | Tamanho máximo do arquivo final, em MB. |
| `CONCURRENCY` | `1` | Quantos downloads simultâneos. |
| `RETENTION_DAYS` | `7` | Dias até apagar automaticamente arquivos antigos. |
| `COOKIES_FROM_BROWSER` | *(vazio)* | `edge`, `chrome`, `firefox`… — o yt-dlp lê os cookies direto do perfil do navegador (só se o YouTube pedir login/verificação). |
| `COOKIES_FILE` | *(vazio)* | Caminho para um `cookies.txt` exportado. Tem prioridade sobre `COOKIES_FROM_BROWSER`. |

### Acessar do celular ou de outra máquina da casa

```env
HOST=0.0.0.0
ACCESS_TOKEN=uma-senha-longa-aqui
```

```bash
npm start
# abra http://<ip-do-computador>:3100 no outro aparelho
```

O navegador vai pedir o token uma vez e guardá-lo. Sem `ACCESS_TOKEN`, qualquer aparelho da rede conseguiria baixar arquivos do seu disco — então defina um.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor. |
| `npm run dev` | Sobe com reinício automático ao salvar arquivos. |
| `npm run setup` | Baixa/verifica `yt-dlp` e `ffmpeg` em `bin/`. |
| `npm run update:ytdlp` | Atualiza só o `yt-dlp`. |
| `npm test` | Roda os testes unitários. |
| `TubeGrab.exe` | Windows: ponto de entrada de um clique — abre o `.bat` abaixo (com ícone e metadados embutidos). |
| `launcher\build-exe.ps1` | Recompila o `TubeGrab.exe` com o `csc.exe` do .NET Framework (sem SDK). |
| `launcher\TubeGrab.bat` | Windows: faz os passos de instalação/atualização e sobe o app; executável sozinho, sem o `.exe`. |

---

## Como funciona por dentro

```
public/          SPA: HTML + CSS + JS puro (sem build, sem framework)
src/server.js    Express, CSP, token, SPA fallback, limpeza agendada
src/routes/      API REST + streaming de arquivos com Range
src/jobs.js      fila, máquina de estados, progresso ao vivo, retenção
src/ytdlp.js     wrapper do yt-dlp: metadados, download, erros humanos
src/db.js        SQLite nativo do Node (node:sqlite), sem dependência nativa
src/urls.js      validação estrita de links e nomes de arquivo seguros
scripts/         download dos binários
launcher/        TubeGrab.bat + TubeGrab.ico + fonte e build do launcher
TubeGrab.exe     launcher de um clique na raiz (ícone embutido, versionado)
bin/             yt-dlp, ffmpeg, ffprobe (não versionado)
storage/videos/  arquivos baixados (não versionado)
data/            banco SQLite (não versionado)
logs/            app.log em JSON Lines (não versionado)
```

Decisões que valem explicar:

- **`yt-dlp` via `spawn`, sem shell.** Sem interpolação de comando, sem injeção. É também o que mantém o app funcionando quando o YouTube muda — basta atualizar o binário.
- **DASH HTTP em vez de HLS.** As variantes `m3u8` reportam bitrates irreais e não informam tamanho, o que estragava as estimativas.
- **`--js-runtime node` sempre que disponível.** O YouTube exige resolver um desafio JavaScript (`n challenge`) para liberar os formatos; sem isso o `yt-dlp` devolve só storyboards ou pede verificação. O Node que roda o app faz esse papel, sem instalar Deno.
- **Cookies opcionais, nunca por padrão.** `COOKIES_FROM_BROWSER` (lê do perfil do navegador) ou `COOKIES_FILE` (arquivo exportado) entram nos argumentos só quando configurados — o app continua funcionando anônimo na maioria das redes.
- **Vídeo isolado + áudio separado**, sempre preferindo `avc1` (H.264) e áudio `m4a` de até 320 kbps / 2 canais. Isso evita AV1/VP9 (que quebram em alguns players) e faixas imersivas experimentais (384 kbps, 5.1) que só inflavam o arquivo.
- **Progresso somado entre streams.** O download de um vídeo tem duas etapas (vídeo, depois áudio); o contador acumula as duas para a barra não voltar ao zero.
- **Kill por árvore de processos.** Cancelar usa `taskkill /T` no Windows e grupo de processos no Unix, para não deixar `yt-dlp`/`ffmpeg` órfãos ocupando disco e rede.
- **`node:sqlite`.** Zero dependência nativa, zero compilação, zero `node-gyp`.

### API

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/health` | Versões, espaço em disco, limites, fila. |
| `POST` | `/api/health/diagnose` | Testa a conexão com o YouTube. |
| `POST` | `/api/info` | Metadados + qualidades disponíveis. |
| `POST` | `/api/jobs` | Cria o download. |
| `GET` | `/api/jobs` | Lista downloads e estado da fila. |
| `GET` | `/api/jobs/:id` | Estado de um download. |
| `POST` | `/api/jobs/:id/cancel` | Cancela e apaga o parcial. |
| `POST` | `/api/jobs/:id/reveal` | Abre a pasta no Explorador/Finder. |
| `DELETE` | `/api/jobs/:id` | Apaga o arquivo e o registro. |
| `GET` | `/api/files/:id` | Stream do arquivo (`?download=1` força download). |

Se `ACCESS_TOKEN` estiver definido, envie `x-access-token: <token>` (ou `?token=`).

---

## Problemas comuns

**"O YouTube pediu verificação de robô."**
O YouTube desconfia do IP (VPN, operadora com CGNAT, muitos downloads seguidos) e exige uma sessão logada. A saída é dar cookies ao `yt-dlp` — use a conta que você já usa no navegador.

Jeito mais fácil: deixe o app ler os cookies direto do navegador. **Feche o navegador** (o Edge/Chrome travam o arquivo de cookies) e coloque no `.env`:
```env
COOKIES_FROM_BROWSER=edge
```
Funciona com `edge`, `chrome`, `firefox`, `brave`, `opera`, `vivaldi`. Se você usa mais de um perfil: `COOKIES_FROM_BROWSER=chrome:Profile 1`.

Alternativa (quando o navegador não pode ser fechado): instale a extensão *Get cookies.txt LOCALLY*, exporte os cookies de `youtube.com`, salve como `cookies.txt` na pasta do app e configure:
```env
COOKIES_FILE=./cookies.txt
```
Reinicie o app depois de mudar o `.env`. Use uma conta que você controla — cookies dão acesso à conta, então não compartilhe o arquivo. Os cookies expiram de tempos em tempos; se o erro voltar, exporte/renove de novo.

**"O YouTube recusou o download (403)."**
Quase sempre é `yt-dlp` desatualizado:
```bash
npm run update:ytdlp
```

**"A qualidade escolhida não está disponível."**
O YouTube oferece resoluções diferentes por vídeo e até por momento. Analise o link de novo e escolha outra opção.

**"ffmpeg não foi encontrado."**
```bash
npm run setup
```

**Não abre a pasta no Explorador.**
O navegador precisa estar na mesma máquina do servidor. Se o app roda em outro computador da rede, use o botão de download.

**Quero apagar tudo e começar do zero.**
Pare o servidor e apague `storage/`, `data/` e `logs/`. Eles são recriados sozinhos.

**Porta 3100 ocupada.**
Feche o console antigo do TubeGrab. Se não souber qual é:

```bat
netstat -ano | findstr :3100
taskkill /PID <numero-do-pid> /F
```

Ou mude no `.env`: `PORT=3200`.

**Windows: o `TubeGrab.exe` não abre, fecha na hora ou mostra erro.**
Rode `launcher\TubeGrab.bat` num terminal para ver a mensagem e siga a seção [Se o executável não funcionar](#se-o-executável-não-funcionar), dentro de *Windows: um clique*.

---

## Privacidade e limites

- O servidor escuta em `127.0.0.1` por padrão — só a sua máquina acessa.
- Nenhum arquivo, link ou metadado sai do seu computador. As únicas conexões externas são para o YouTube (via `yt-dlp`) e, uma vez, para baixar os binários.
- O banco guarda apenas o histórico local: título, canal, thumbnail, qualidade, status e caminho do arquivo.
- O CSP bloqueia scripts de terceiros; a interface não carrega nada de CDN.

## Aviso legal

Este app é uma ferramenta. Use apenas para conteúdo que você tem o direito de baixar: seus próprios vídeos, material com licença Creative Commons, domínio público, ou conteúdo para o qual você tem autorização do autor. Baixar conteúdo protegido sem permissão pode violar os Termos de Serviço do YouTube e a legislação de direitos autorais do seu país. A responsabilidade pelo uso é sua.

---

Feito para rodar localmente, sem cadastro e sem nuvem.
