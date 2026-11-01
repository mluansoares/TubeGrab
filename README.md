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

### Windows: duplo clique (sem terminal)

Na raiz do projeto fica **`TubeGrab.lnk`** — o único arquivo do launcher que você precisa ver. Ele aponta para **`launcher\TubeGrab.bat`**, que guarda o script e o ícone (`launcher\TubeGrab.ico`). Um duplo clique faz tudo:

1. confere Node.js e npm (se faltar — ou se for anterior ao 22.5 — instala o LTS via `winget`, com fallback para o instalador oficial do nodejs.org);
2. roda `npm install` se as dependências ainda não estiverem em `node_modules/`;
3. roda `npm run setup` se faltar `yt-dlp`, `ffmpeg` ou `ffprobe` em `bin/`;
4. sobe o servidor com `npm start`;
5. abre o navegador padrão em `http://localhost:<PORT>` assim que a porta responde.

O script roda sempre a partir da raiz do projeto (`cd /d "%~dp0.."`), então `node_modules/`, `bin/` e `.env` são encontrados mesmo estando em `launcher/`.

A porta sai do `.env` (`3100` se o arquivo não existir). Se o app já estiver rodando, o script apenas abre o navegador em vez de subir uma segunda instância. A espera pela porta roda em segundo plano, então o `npm start` não fica bloqueado.

> No Windows um `.bat` não aceita ícone embutido: quem mostra o `TubeGrab.ico` é o atalho `TubeGrab.lnk`. Se o Explorer insistir no ícone genérico, tecle **F5** na pasta ou rode `ie4uinit.exe -show` para limpar o cache. O `.lnk` guarda caminho absoluto — se mover a pasta, recrie o atalho ou execute `launcher\TubeGrab.bat` direto.

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
| `launcher\TubeGrab.bat` | Windows: faz os passos de instalação/atualização e sobe o app com um duplo clique (`TubeGrab.lnk`, na raiz, é o atalho com ícone). |

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
launcher/        TubeGrab.bat + TubeGrab.ico (o atalho aponta para cá)
TubeGrab.lnk     atalho na raiz, com ícone, que executa o launcher (não versionado)
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
Mude no `.env`: `PORT=3200`.

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
