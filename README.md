# Meu Segredinho

## Link Juju por país

Na Vercel, `/juju`, `/juju/` e `/juju/index.html` mostram a página original para
Brasil e localização desconhecida. Para os demais países identificados, o
middleware escolhe espanhol para países hispanófonos, árabe para países árabes
e inglês para os demais países, no mesmo endereço, com o botão direcionado
para `https://abrir.link/BBiZW`. O build gera essa versão a partir do HTML
original, preservando o layout. Não há consulta externa de IP nem armazenamento
do IP. VPNs podem alterar o país identificado. O fluxo continua exigindo o
clique no botão para abrir o Telegram.

As versões são geradas em `/juju/international.html` (inglês), `/juju/es.html`
(espanhol) e `/juju/ar.html` (árabe, com direção de leitura da direita para a
esquerda). O mapa de países fica em `lib/juju-locale.cjs`. A seleção usa o país
do IP, que não necessariamente corresponde ao idioma pessoal do visitante.

Essa seleção de país depende do middleware da Vercel; `npm start` continua
servindo a página estática original localmente.

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
- Conteúdo e aparência de página personalizados para Brasil, Europa, Estados Unidos e GBP/Reino Unido, além de destinos próprios para o botão e fallback para as demais regiões.
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
- Em uma instalação existente, aplique `supabase/migrations/20261105082119_country_destinations.sql` e `supabase/migrations/20261105092829_regional_page_customization.sql` antes de publicar esta versão. A segunda migração salva variações privadas por região e disponibiliza ao visitante somente a versão correspondente. O país/continente vem dos cabeçalhos de geolocalização da Vercel; o IP não é armazenado.
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

## Leads e localização da Juju

O painel autenticado em `/dashboard#tracking` acompanha visitas e cliques de
`/juju`, incluindo as versões em inglês, espanhol e árabe. Há filtros de 24 horas,
7 e 30 dias, país, resumo por país e até 100 visitantes recentes. A localização
é a cidade/região estimada pela Vercel a partir do IP; o aplicativo não solicita
GPS nem armazena IP completo ou coordenadas. Os IDs aleatórios do navegador
expiram em 30 dias. A retenção dos eventos no banco é independente desse prazo;
os relatórios consultam no máximo os últimos 30 dias. VPNs, bloqueadores,
acessos automatizados e navegadores diferentes afetam a precisão das métricas.
UTM source/medium/campaign e somente o domínio do referenciador são registrados.
Não há identificação do Telegram nem confirmação de pagamento nesta integração.

### Ativação

1. No projeto Supabase **usado pela Privame** (`SUPABASE_URL`), aplique
   `supabase/migrations/20261116074259_juju_visitor_tracking.sql`. Não aplique essa
   migração em um projeto de outro aplicativo.
2. No SQL Editor, vincule a página a uma conta existente. Substitua o e-mail abaixo
   pelo e-mail de login correto e confirme que a operação inseriu exatamente 1 linha:

   ```sql
   insert into public.tracking_sites(slug, user_id, name, path)
   select 'juju', id, 'Juju', '/juju'
   from auth.users where lower(email) = lower('OWNER_LOGIN_EMAIL');
   ```

3. Entre com essa conta em `/dashboard` e abra **Leads e localização**. A entrada
   também existe no menu do dashboard institucional em `/privame/dashboard/`.
4. Publique o código na Vercel após instalar e verificar o banco. Visite `/juju`
   com UTMs e clique no botão; confirme os eventos no painel. Não há histórico
   anterior à ativação.

A coleta pública só pode inserir campos limitados em eventos da Juju. Não tem
permissão para consultar, editar ou apagar eventos. Os relatórios usam a sessão
do proprietário e RLS. Outras contas não podem se atribuir a propriedade da Juju.
Como em qualquer coleta pública sem autenticação de visitantes, eventos podem
ser enviados por automações; os números são indicativos, não prova de identidade.
Falha de coleta não bloqueia a abertura do bot. Falha ao carregar o relatório
aparece como erro, sem transformar a falha em números zero.

### Verificação

- `node --test tests/tracking.test.mjs`: validação, geolocalização do servidor,
  autenticação, autorização, repetição e isolamento dos relatórios na API.
- `supabase/tests/juju_tracking.sql`: executar em banco descartável após a migração;
  verifica RLS e contagens e reverte todas as alterações de teste.
- `PORT=3100 npm start`, `npx playwright install chromium`, então
  `node tests/tracking-browser.mjs`: interface com respostas simuladas, filtros,
  erros/repetição, tela móvel e envio de visita/clique. Esse teste não substitui
  a verificação final com o projeto Supabase de produção.
