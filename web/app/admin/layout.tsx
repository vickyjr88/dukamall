export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: '-apple-system, sans-serif', maxWidth: 960, margin: '40px auto', padding: '0 16px' }}>
      <h2 style={{ marginBottom: 8 }}>Shops Platform -- Operator Console</h2>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 24, fontSize: 14 }}>
        <a href="/admin/shops">Shops</a>
      </nav>
      {children}
    </div>
  );
}
