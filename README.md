# Consulta de Ensinamentos V7 — Consolidada

Aplicação Next.js + Neon PostgreSQL para pesquisa histórica de tópicos de ensinamentos e doutrina.

> **Pacote consolidado oficial da V7 (28/08/2026).** Reúne em uma única base todas as correções e recursos validados até esta etapa, incluindo pesquisa documental, perguntas, administração protegida, PDFs, Bíblia ARC e Dicionário Bíblico.


## Recursos da V7

- Design moderno tecnológico com toque institucional (Estilo B).
- Pesquisa ampliada por título, conteúdo, palavras-chave, título da fonte e tipo da fonte.
- Busca por `Convenção` corrigida.
- Ordenação por relevância, cronológica crescente e cronológica decrescente.
- Modo **Perguntar ao acervo**, com resposta documental e indicação de fontes.
- Área **/admin** protegida por senha administrativa.
- Sessão administrativa por cookie HttpOnly; os formulários de inserção só aparecem após autenticação.
- Inserção manual de tópicos e novas fontes.
- Prevenção de duplicação acidental: o administrador é alertado quando o mesmo conteúdo ou o mesmo título/página já existe na fonte; a gravação duplicada exige confirmação explícita.
- Importação de conteúdo de PDF para preencher um novo tópico, com revisão antes de salvar.
- Impressão completa da pesquisa em `/print`.
- Impressão de tópico individual e de resposta documental.
- Central **Documentos** para baixar PDFs por tipo de documento ou por ano.

## Variáveis de ambiente

Crie `.env.local`:

```env
DATABASE_URL="postgresql://USUARIO:SENHA@HOST/neondb?sslmode=require"
ADMIN_PASSWORD="ESCOLHA-UMA-SENHA-FORTE"
```

`DATABASE_URL` deve ser a conexão do Neon. `ADMIN_PASSWORD` controla o acesso à área de inserção.

## Executar localmente

```powershell
npm install
npm run check
npm run dev
```

Acesse `http://localhost:3000` (ou a porta informada pelo Next.js).

## Importar tópico por PDF

1. Entre em `/admin` com a senha de administrador.
2. Selecione **Arquivo PDF** e clique em **Importar conteúdo do PDF**.
3. O navegador extrai o texto e preenche o conteúdo do tópico.
4. Revise título, fonte, ano, páginas, categoria e palavras-chave.
5. Clique em **Salvar tópico no Neon**.

O importador funciona com PDFs que possuem texto selecionável. PDFs digitalizados somente como imagem precisam de OCR antes da importação. O arquivo PDF em si não é armazenado no Neon; somente o conteúdo revisado e os metadados são gravados.

## Segurança

- Nunca publique `.env.local`.
- Nunca coloque a connection string do Neon no frontend.
- A senha administrativa é validada no servidor.
- Após o login, o servidor cria uma sessão HttpOnly com duração de 8 horas.
- A rota de gravação também valida a sessão; ocultar o formulário no navegador não é a única proteção.


## Pesquisa Bíblica — V7

A V7 inclui uma área própria para a Bíblia Sagrada ARC, com busca por referência, livro/capítulo, palavra e frase. A importação bíblica é separada das tabelas de ensinamentos.

Execute uma vez após atualizar os arquivos:

```bash
npm run preparar:biblia
```

Base preparada: **66 livros · 1.189 capítulos · 31.105 versículos**.

## Dicionário Bíblico integrado

A aba **Bíblia** agora possui dois modos: **Bíblia Sagrada** e **Dicionário Bíblico**.

O dicionário foi convertido do EPUB fornecido para PDF e também preparado para pesquisa no Neon. A base pesquisável contém **5.614 verbetes efetivamente marcados no arquivo EPUB**. A descrição editorial interna do EPUB informa 5.615 verbetes; a importação usa somente as entradas estruturadas que existem no arquivo fornecido.

Para criar as tabelas e importar o dicionário:

```bash
npm run preparar:dicionario
```

Depois, inicie normalmente:

```bash
npm run dev
```

O PDF completo fica disponível em `/dicionario-biblico.pdf`.
