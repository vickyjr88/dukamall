import './portal.css';
import { PortalNav } from './portal-nav';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-root">
      <div className="portal-shell">
        <aside className="portal-sidebar">
          <div className="portal-sidebar-brand">Shops Platform</div>
          <PortalNav />
        </aside>
        <main className="portal-content">{children}</main>
      </div>
    </div>
  );
}
