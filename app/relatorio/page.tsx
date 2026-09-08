import Link from "next/link";
import styles from "./relatorio.module.css";

export const metadata = {
  title: "Relatório | Consulta de Ensinamentos",
};

export default function RelatorioPage() {
  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <Link className={styles.back} href="/">← Voltar à Consulta de Ensinamentos</Link>
        <span className={styles.kicker}>Documentos e relatórios</span>
        <h1>Relatório</h1>
        <p>Área destinada a relatórios e documentos de consulta complementar.</p>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.icon}>R</div>
          <div className={styles.content}>
            <span className={styles.badge}>Atualizado em 20/08/2026</span>
            <h2>Anciães mais antigos do Brasil</h2>
            <p>Documento em PDF com a relação apresentada no arquivo incorporado à V9.</p>
            <div className={styles.actions}>
              <a
                className={styles.primary}
                href="/relatorios/anciaes-mais-antigos-do-brasil.pdf"
                target="_blank"
                rel="noreferrer"
              >
                Abrir Anciães mais antigos do Brasil
              </a>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
