# Meu Segredinho

Este repositório reúne sites independentes. Cada pasta pode ser usada como diretório raiz de um projeto ou subdomínio separado.

## Estrutura

| Caminho | Finalidade |
| --- | --- |
| / | Site legado principal e arquivos mantidos por compatibilidade |
| /becarossi | Site independente Beca Rossi |
| /eliane | Site independente Eliane |
| /privame | Site institucional e dashboard da agência Privame |

## Regra importante

Não mover, renomear ou excluir as pastas e os arquivos antigos sem revisar primeiro os projetos vinculados, pois eles podem estar sendo usados por subdomínios existentes.

## Privame

Para publicar a agência como projeto separado, selecione privame como Root Directory. O dashboard fica em /dashboard/.

## Privame Links

Aplicação para criar páginas de links personalizadas em endereços como `https://privame.site/seunome`.

### Funcionalidades

- Cadastro e login por e-mail no Supabase Auth, com sessão em cookie HttpOnly.
- Criação de várias páginas por conta, cada uma com seu próprio endereço.
- Edição de nome, foto, título, subtítulo, botão, destino, selo, status, rodapé e cores.
- Prévia ao vivo do layout baseado no HTML de referência.
- Página pública responsiva, modo claro/escuro e redirecionamento animado.
- Contagem atômica de cliques no botão.
- Destinos personalizados por país, escolhidos pela localização aproximada do IP e com fallback para o endereço padrão.
- Dados em Supabase Postgres, fotos em Supabase Storage e APIs como Vercel Functions.
- As páginas e demais caminhos legados do repositório continuam atendidos.

### Configuração local

Requer Node.js 22 ou mais recente e as variáveis listadas em `.env.example`. O arquivo não contém valores secretos. Configure as variáveis no ambiente local sem adicioná-las ao Git.

```powershell
npm start
```

Abra `http://localhost:3000/dashboard` para entrar ou `http://localhost:3000/register` para criar uma conta. As páginas locais usam `http://localhost:3000/seunome`.

### Supabase

- Em uma instalação nova, execute `supabase/schema.sql` no SQL Editor para criar a tabela, as políticas RLS, o bucket de imagens e as funções de contagem e redirecionamento. A leitura pública mantém acesso apenas aos campos exibidos na página.
- Em uma instalação existente, aplique `supabase/migrations/20261105082119_country_destinations.sql` antes de publicar a nova versão. A migração adiciona as regras por país e mantém a função antiga disponível durante a atualização. O país é inferido pelo cabeçalho `x-vercel-ip-country`; o IP do visitante não é armazenado.
- Configure a URL do site como `https://privame.site` e permita os redirecionamentos `https://privame.site/auth/callback` e `http://localhost:3000/auth/callback`.
- A confirmação de e-mail depende das configurações de Auth e do SMTP do projeto.

### Vercel

- Importe o repositório e mantenha a raiz como Root Directory.
- O `vercel.json` seleciona o preset Other, executa `node scripts/build.mjs` e publica `dist/`. O build inclui as páginas legadas junto com o novo painel.
- Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `PUBLIC_BASE_URL=https://privame.site` nas variáveis de produção. O backend usa a chave publicável com a sessão do usuário e as políticas RLS; não precisa de uma chave privilegiada do Supabase.
- Conecte `privame.site` ao projeto Vercel. A aplicação usa rewrites para o painel e para URLs públicas de um segmento.
- Para usar cadastro por e-mail em Preview, permita também a URL de callback daquele domínio nas Redirect URLs do Supabase.

`vercel.json` contém as rotas do app e `api/[...path].mjs` encaminha as solicitações para as funções de backend. O `index.html` existente e as pastas independentes são preservados.

### Observações

- O slug aceita letras sem acento, números e hífen, de 3 a 30 caracteres.
- Nenhuma chave privilegiada do Supabase é usada no cliente ou no servidor. RLS restringe cada conta às próprias páginas; campos públicos e uploads têm permissões explícitas e limitadas.
- Não há recuperação de senha nesta primeira versão.
