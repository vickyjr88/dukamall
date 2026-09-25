export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: '-apple-system, sans-serif', maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <h2 style={{ marginBottom: 24 }}>Shops Platform -- Admin</h2>
      {children}
    </div>
  );
}
