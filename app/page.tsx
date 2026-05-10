export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>NextFlow Backend</h1>
      <p>Status: <strong style={{ color: 'green' }}>Running</strong></p>
      <p>Available API routes:</p>
      <ul>
        <li><code>GET /api/workflows</code></li>
        <li><code>POST /api/workflows</code></li>
        <li><code>GET /api/workflows/:id</code></li>
        <li><code>POST /api/workflows/:id/run</code></li>
        <li><code>GET /api/workflows/:id/runs</code></li>
        <li><code>GET /api/health</code></li>
      </ul>
    </main>
  )
}
