# Conversor de Áudio Web

Esta cópia do projeto foi preparada para uso real via navegador, com backend de conversão.

## Como executar (desenvolvimento)

1. Abra um terminal na pasta `conversor de audio web`.
2. Instale dependências:
   - `npm install`
3. Suba frontend + backend:
   - `npm run dev:web`
4. Abra no navegador:
   - `http://localhost:5173`

## Como funciona

- O navegador envia os arquivos de áudio para `POST /api/convert`.
- O backend converte com FFmpeg no servidor.
- O backend retorna um arquivo `converted-audio.zip` para download.

## Compatibilidade de cliente

- Windows: navegador suportado.
- macOS: navegador suportado.
- Android: navegador suportado.

Observacao: a conversao sempre acontece no servidor onde a API esta rodando.

## Scripts novos

- `npm run dev:web`: sobe frontend e backend juntos.
- `npm run dev:web:server`: sobe somente API em `:3001`.
- `npm run dev:web:client`: sobe somente Vite em `:5173`.
- `npm run start:web`: inicia API em modo producao.
- `npm run build:web`: build do frontend web.
