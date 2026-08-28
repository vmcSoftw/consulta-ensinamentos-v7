'use client';

export default function PrintControls() {
  return (
    <div className="printControls noPrint">
      <button onClick={() => window.print()}>Imprimir / Salvar em PDF</button>
      <button className="ghost" onClick={() => window.close()}>Fechar</button>
    </div>
  );
}
