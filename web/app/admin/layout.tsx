import './admin.css';
import { AdminNav } from './admin-nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-root">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand">Shops Platform</div>
          <div className="admin-sidebar-tag">Operator console</div>
          <AdminNav />
        </aside>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
