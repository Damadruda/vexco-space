export default function AssistantPage() {
  return (
    <div className="ql-page px-8 py-10 max-w-2xl mx-auto">
      <h1 className="ql-h1 mb-3">Asistente</h1>
      <p className="ql-body">
        El asistente ha sido reemplazado por el{" "}
        <a href="/agile-board" className="text-ql-accent hover:underline">
          Agile Board
        </a>{" "}
        y los agentes especializados. Abre un proyecto y usa el War Room para consultas directas con los expertos.
      </p>
    </div>
  );
}
