export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: '-apple-system, sans-serif', maxWidth: 960, margin: '40px auto', padding: '0 16px' }}>
      <h2 style={{ marginBottom: 8 }}>Shops Platform -- Admin</h2>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 24, fontSize: 14 }}>
        <a href="/portal/dashboard">Dashboard</a>
        <a href="/portal/orders">Orders</a>
        <a href="/portal/products">Products</a>
        <a href="/portal/theme">Theme</a>
        <a href="/portal/domain">Domain</a>
        <a href="/portal/settings">Settings</a>
      </nav>
      {children}
    </div>
  );
}
