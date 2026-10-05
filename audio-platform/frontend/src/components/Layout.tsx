import { Link } from "react-router-dom";
import { Music2 } from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-white">
      <header className="px-6 flex items-center gap-3" style={{ background: '#141414', borderBottom: '1px solid #252525', height: 52 }}>
        <Link to="/" className="flex items-center gap-2 text-accent font-bold text-lg hover:text-accent-hover transition-colors">
          <Music2 size={22} />
          StemSplit
        </Link>
        <span className="text-surface-3 text-xs ml-2 border border-surface-3 rounded px-2 py-0.5">
          AI Audio Platform
        </span>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
